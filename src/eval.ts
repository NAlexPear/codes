#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

import type { CaseEvaluation, EvaluationCounts } from './evaluation.ts';

import { buildJevRequest, parseCatalog } from './codes.ts';
import {
  evaluateCase,
  hasFailures,
  onlyFailures,
  parseEvaluationCases,
  summarizeEvaluations,
} from './evaluation.ts';
import { askJev } from './typesafe.ts';

const FAILURE = 1;
const JSON_INDENT = 2;
const ZERO = 0;
const CATALOG_URL = new URL('../data/billing-codes.json', import.meta.url);
const CORPUS_URL = new URL(
  '../data/hand-surgery-dictations.json',
  import.meta.url,
);
const THRESHOLDS = { confidence: 0.8, likelihood: 0.5 };

interface EvalOutput {
  cases: number;
  counts: EvaluationCounts;
  evaluations: CaseEvaluation[];
  failures: CaseEvaluation[];
  models: string[];
  thresholds: typeof THRESHOLDS;
  usage: { inputTokens: number; modelCalls: number };
}

const run = async (): Promise<EvalOutput> => {
  const [catalogSource, corpusSource] = await Promise.all([
    readFile(CATALOG_URL, 'utf8'),
    readFile(CORPUS_URL, 'utf8'),
  ]);
  const catalog = parseCatalog(JSON.parse(catalogSource) as unknown);
  const fixtures = parseEvaluationCases(JSON.parse(corpusSource) as unknown);
  const evaluations: CaseEvaluation[] = [];
  const models = new Set<string>();
  let inputTokens = 0;
  for (const fixture of fixtures) {
    const request = buildJevRequest(fixture.dictation, catalog, 'jev-latest');
    const response = await askJev(request, {
      apiKey: process.env['TYPESAFE_API_KEY'] ?? '',
    });
    inputTokens += response.usage.input_tokens;
    models.add(response.model);
    evaluations.push(
      evaluateCase({ catalog, fixture, response, thresholds: THRESHOLDS }),
    );
  }
  return {
    cases: fixtures.length,
    counts: summarizeEvaluations(evaluations),
    evaluations,
    failures: evaluations
      .filter((evaluation) => hasFailures(evaluation))
      .map((evaluation) => onlyFailures(evaluation)),
    models: [...models],
    thresholds: THRESHOLDS,
    usage: { inputTokens, modelCalls: fixtures.length },
  };
};

try {
  const output = await run();
  process.stdout.write(`${JSON.stringify(output, undefined, JSON_INDENT)}\n`);
  if (output.failures.length > ZERO) {
    process.exitCode = FAILURE;
  }
} catch (error: unknown) {
  let message = String(error);
  if (error instanceof Error) {
    ({ message } = error);
  }
  process.stderr.write(`codes-eval: ${message}\n`);
  process.exitCode = FAILURE;
}
