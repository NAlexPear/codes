#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
  buildJevRequest,
  parseCatalog,
  readCodeResults,
} from "./codes.ts";
import { askJev } from "./typesafe.ts";

const HELP = `Usage: codes --codes <catalog.json> [--input <dictation.txt>] [options]

Scores a bounded catalog of billing-code candidates against one medical dictation.
Reads the dictation from stdin when --input is omitted and writes JSON to stdout.

Options:
  --codes <path>       JSON array of { code, system, description, guidance? }
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

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      codes: { type: "string" },
      input: { type: "string" },
      likelihood: { type: "string", default: "0.5" },
      confidence: { type: "string", default: "0.8" },
      model: { type: "string", default: "jev-latest" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
  });

  if (values.help) {
    console.log(HELP);
    return;
  }
  if (values.codes === undefined) {
    throw new Error("--codes is required. Run with --help for usage.");
  }

  const likelihoodThreshold = parseThreshold(values.likelihood, "--likelihood");
  const confidenceThreshold = parseThreshold(values.confidence, "--confidence");

  const [catalogText, dictation] = await Promise.all([
    readFile(values.codes, "utf8"),
    values.input === undefined
      ? readStdin()
      : readFile(values.input, "utf8"),
  ]);
  const catalog = parseCatalog(JSON.parse(catalogText) as unknown);
  const request = buildJevRequest(dictation, catalog, values.model);
  const response = await askJev(request, {
    apiKey: process.env.TYPESAFE_API_KEY ?? "",
  });
  const results = readCodeResults(
    response,
    catalog,
    likelihoodThreshold,
    confidenceThreshold,
  );

  console.log(
    JSON.stringify(
      {
        model: response.model,
        thresholds: {
          likelihood: likelihoodThreshold,
          confidence: confidenceThreshold,
        },
        matches: results.filter(({ needsManualReview }) => !needsManualReview),
        manualReview: results.filter(({ needsManualReview }) => needsManualReview),
        usage: response.usage,
      },
      null,
      2,
    ),
  );
}

async function readStdin(): Promise<string> {
  process.stdin.setEncoding("utf8");
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input;
}

function parseThreshold(value: string, name: string): number {
  const threshold = Number(value);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error(`${name} must be a number from 0 to 1.`);
  }
  return threshold;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`codes: ${message}`);
  process.exitCode = 1;
});
