#!/usr/bin/env node

import type { Readable } from 'node:stream';

import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';

import type { ResultThresholds } from './codes.ts';
import type { Extract, ExtractionResult } from './extractor.ts';

import { createExtractor, loadCatalog } from './extractor.ts';
import { runStream } from './stream.ts';

const ZERO = 0;
const ONE = 1;
const JSON_INDENT = 2;
const HELP = `Usage: codes [--input <dictation.txt>] [--stream] [options]

Scores the internal billing-code catalog against one medical dictation.
Reads the dictation from stdin when --input is omitted and writes JSON to stdout.

Options:
  --input <path>       Dictation text file (default: stdin)
  -s, --stream         Read newline-delimited streaming events
  --likelihood <0..1>  Minimum support-or-review probability (default: 0.5)
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

const writeResult = (output: ExtractionResult): void => {
  process.stdout.write(`${JSON.stringify(output, undefined, JSON_INDENT)}\n`);
};

const readLines = (path: string | undefined): AsyncIterable<string> => {
  let input: Readable = process.stdin;
  if (path !== undefined) {
    input = createReadStream(path, 'utf8');
  }
  return createInterface({ crlfDelay: Infinity, input });
};

const configuredExtractor = async (
  apiKey: string,
  model: string,
  thresholds: ResultThresholds,
): Promise<Extract> =>
  createExtractor({ apiKey, catalog: await loadCatalog(), model, thresholds });

const writeStreamResult = (output: object): void => {
  process.stdout.write(`${JSON.stringify(output)}\n`);
};

const main = async (): Promise<void> => {
  const { values } = parseArgs({
    options: {
      confidence: { default: '0.8', type: 'string' },
      help: { short: 'h', type: 'boolean' },
      input: { type: 'string' },
      likelihood: { default: '0.5', type: 'string' },
      model: { default: 'jev-latest', type: 'string' },
      stream: { short: 's', type: 'boolean' },
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
  const extract = await configuredExtractor(
    process.env['TYPESAFE_API_KEY'] ?? '',
    values.model,
    thresholds,
  );
  if (values.stream === true) {
    await runStream(readLines(values.input), {
      extract,
      output: writeStreamResult,
    });
    return;
  }
  writeResult(await extract(await readDictation(values.input)));
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
