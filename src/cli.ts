#!/usr/bin/env node

import type { Readable } from 'node:stream';

import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';

import type { ResultThresholds } from './codes.ts';
import type { Enrich, Extract, ExtractionResult } from './extractor.ts';
import type { Loader } from './loader.ts';
import type { OutputMode } from './output.ts';
import type { StreamSnapshot } from './stream.ts';

import {
  createClassifier,
  createEnricher,
  createExtractor,
  loadCatalog,
} from './extractor.ts';
import { createInPlaceRenderer, createLoader } from './loader.ts';
import {
  formatBatchOutput,
  formatStreamOutput,
  parseOutputMode,
} from './output.ts';
import { runStream } from './stream.ts';

const ZERO = 0;
const ONE = 1;
const HELP = `Usage: codes [--input <dictation.txt>] [--stream] [options]

Scores the internal billing-code catalog against one medical dictation.
Reads the dictation from stdin when --input is omitted.

Options:
  --input <path>       Dictation text file (default: stdin)
  -s, --stream         Read newline-delimited streaming events
  -o, --output <mode>  Output: human (default) or json
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

const writeBatchResult = (result: ExtractionResult, mode: OutputMode): void => {
  process.stdout.write(
    `${formatBatchOutput(result, mode, {
      color: mode === 'human' && process.stdout.isTTY,
      columns: process.stdout.columns,
    })}\n`,
  );
};

const readLines = (path: string | undefined): AsyncIterable<string> => {
  let input: Readable = process.stdin;
  if (path !== undefined) {
    input = createReadStream(path, 'utf8');
  }
  return createInterface({ crlfDelay: Infinity, input });
};

interface ConfiguredExtractors {
  enrich: Enrich;
  full: Extract;
  provisional: Extract;
}

const configuredExtractors = async (
  apiKey: string,
  model: string,
  thresholds: ResultThresholds,
): Promise<ConfiguredExtractors> => {
  const options = { apiKey, catalog: await loadCatalog(), model, thresholds };
  return {
    enrich: createEnricher(options),
    full: createExtractor(options),
    provisional: createClassifier(options),
  };
};

const streamWriter = (mode: OutputMode): ((result: StreamSnapshot) => void) => {
  let first = true;
  const inPlace = createInPlaceRenderer((output) => {
    process.stdout.write(output);
  });
  return (result): void => {
    if (mode === 'json') {
      process.stdout.write(`${formatStreamOutput(result, mode)}\n`);
      return;
    }
    const output = formatStreamOutput(result, mode, {
      color: process.stdout.isTTY,
      columns: process.stdout.columns,
    });
    if (process.stdout.isTTY) {
      inPlace(output);
      return;
    }
    if (!first) {
      process.stdout.write('\n');
    }
    process.stdout.write(`${output}\n`);
    first = false;
  };
};

const withLoader =
  (extract: Extract, loader: Loader): Extract =>
  async (dictation) => {
    loader.start();
    try {
      return await extract(dictation);
    } finally {
      loader.stop();
    }
  };

const loaderFor = (mode: OutputMode): Loader =>
  createLoader(
    process.stderr,
    'Analyzing dictation…',
    mode === 'human' && process.stderr.isTTY,
  );

const runBatch = async (
  extract: Extract,
  input: string | undefined,
  mode: OutputMode,
): Promise<void> => {
  const result = await extract(await readDictation(input));
  writeBatchResult(result, mode);
};

const main = async (): Promise<void> => {
  const { values } = parseArgs({
    options: {
      confidence: { default: '0.8', type: 'string' },
      help: { short: 'h', type: 'boolean' },
      input: { type: 'string' },
      likelihood: { default: '0.5', type: 'string' },
      model: { default: 'jev-latest', type: 'string' },
      output: { default: 'human', short: 'o', type: 'string' },
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
  const mode = parseOutputMode(values.output);
  const configured = await configuredExtractors(
    process.env['TYPESAFE_API_KEY'] ?? '',
    values.model,
    thresholds,
  );
  const loader = loaderFor(mode);
  if (values.stream === true) {
    await runStream(readLines(values.input), {
      enrich: async (dictation, result) => {
        loader.start();
        try {
          return await configured.enrich(dictation, result);
        } finally {
          loader.stop();
        }
      },
      extract: withLoader(configured.provisional, loader),
      output: streamWriter(mode),
    });
    return;
  }
  await runBatch(withLoader(configured.full, loader), values.input, mode);
};

// Node 24 SEA requires a CommonJS bundle without top-level await.
main().catch((error: unknown) => {
  let message = String(error);
  if (error instanceof Error) {
    ({ message } = error);
  }
  process.stderr.write(`codes: ${message}\n`);
  process.exitCode = ONE;
});
