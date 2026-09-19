#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import type { CodeResult, ResultThresholds } from './codes.ts';

import { buildJevRequest, parseCatalog, readCodeResults } from './codes.ts';
import { askJev } from './typesafe.ts';

const ZERO = 0;
const ONE = 1;
const JSON_INDENT = 2;
const CATALOG_URL = new URL('../data/billing-codes.json', import.meta.url);
const HELP = `Usage: codes [--input <dictation.txt>] [options]

Scores the internal billing-code catalog against one medical dictation.
Reads the dictation from stdin when --input is omitted and writes JSON to stdout.

Options:
  --input <path>       Dictation text file (default: stdin)
  --likelihood <0..1>  Minimum supported probability (default: 0.5)
  --confidence <0..1>  Minimum confidence without review (default: 0.8)
  --model <name>       Jev model or alias (default: jev-latest)
  --help               Show this help

Environment:
  TYPESAFE_API_KEY     Required TypeSafe API key

The dictation is sent to TypeSafe. Do not send protected health information unless
your organization's TypeSafe agreement and workflow permit it. This is coding
decision support, not an autonomous billing decision.`;

const readStdin = async (): Promise<string> => {
  process.stdin.setEncoding('utf8');
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input;
};

const parseThreshold = (value: string, name: string): number => {
  const threshold = Number(value);
  if (!Number.isFinite(threshold) || threshold < ZERO || threshold > ONE) {
    throw new Error(`${name} must be a number from 0 to 1.`);
  }
  return threshold;
};

const readDictation = (path: string | undefined): Promise<string> => {
  if (path === undefined) {
    return readStdin();
  }
  return readFile(path, 'utf8');
};

interface CliOutput {
  manualReview: CodeResult[];
  matches: CodeResult[];
  model: string;
  thresholds: ResultThresholds;
  usage: { input_tokens: number; output_tokens: number };
}

const writeResult = (output: CliOutput): void => {
  process.stdout.write(`${JSON.stringify(output, undefined, JSON_INDENT)}\n`);
};

const main = async (): Promise<void> => {
  const { values } = parseArgs({
    options: {
      confidence: { default: '0.8', type: 'string' },
      help: { short: 'h', type: 'boolean' },
      input: { type: 'string' },
      likelihood: { default: '0.5', type: 'string' },
      model: { default: 'jev-latest', type: 'string' },
    },
    strict: true,
  });
  if (values.help === true) {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  const thresholds = {
    confidence: parseThreshold(values.confidence, '--confidence'),
    likelihood: parseThreshold(values.likelihood, '--likelihood'),
  };
  const [catalogText, dictation] = await Promise.all([
    readFile(CATALOG_URL, 'utf8'),
    readDictation(values.input),
  ]);
  const catalog = parseCatalog(JSON.parse(catalogText) as unknown);
  const request = buildJevRequest(dictation, catalog, values.model);
  const response = await askJev(request, {
    apiKey: process.env['TYPESAFE_API_KEY'] ?? '',
  });
  const results = readCodeResults(response, catalog, thresholds);
  writeResult({
    manualReview: results.filter(({ needsManualReview }) => needsManualReview),
    matches: results.filter(({ needsManualReview }) => !needsManualReview),
    model: response.model,
    thresholds,
    usage: response.usage,
  });
};

try {
  await main();
} catch (error: unknown) {
  let message = String(error);
  if (error instanceof Error) {
    ({ message } = error);
  }
  process.stderr.write(`codes: ${message}\n`);
  process.exitCode = ONE;
}
