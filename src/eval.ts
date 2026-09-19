#!/usr/bin/env node

import type { EvalOptions } from './eval-options.ts';
import type {
  ProviderKeys,
  ProviderName,
  ProviderSpec,
} from './eval-providers.ts';
import type {
  CaseEvaluation,
  EvaluationCase,
  EvaluationCounts,
} from './evaluation.ts';

import catalogData from '../data/billing-codes.json' with { type: 'json' };
import syntheticCasesData from '../data/hand-surgery-dictations.json' with { type: 'json' };
import sourceCasesData from '../data/hand-surgery-source-evals.json' with { type: 'json' };
import { parseCatalog } from './codes.ts';
import { HELP, parseEvalOptions } from './eval-options.ts';
import { infer } from './eval-providers.ts';
import {
  evaluateCase,
  hasFailures,
  onlyFailures,
  parseEvaluationCases,
  summarizeEvaluations,
} from './evaluation.ts';

const FAILURE = 1;
const JSON_INDENT = 2;
const ZERO = 0;
const ONE = 1;
const PROCESS_ARGUMENT_OFFSET = 2;
const P50 = 0.5;
const P95 = 0.95;
const THRESHOLDS = { confidence: 0.8, likelihood: 0.5 };

interface Usage {
  inputTokens: number;
  modelCalls: number;
  outputTokens: number;
}

interface Timing {
  p50Ms: number;
  p95Ms: number;
  totalMs: number;
}

interface EvalRun {
  cases: number;
  counts: EvaluationCounts;
  evaluations: CaseEvaluation[];
  failures: CaseEvaluation[];
  latenciesMs: number[];
  models: string[];
  provider: ProviderName;
  repetition: number;
  requestedModel: string;
  timing: Timing;
  usage: Usage;
}

interface EvalSummary {
  casesPassed: number;
  casesTotal: number;
  counts: EvaluationCounts;
  models: string[];
  provider: ProviderName;
  repetitions: number;
  requestedModel: string;
  runsPassed: number;
  timing: Timing;
  usage: Usage;
}

const percentile = (values: readonly number[], fraction: number): number => {
  const sorted = values.toSorted((left, right) => left - right);
  const index = Math.max(ZERO, Math.ceil(sorted.length * fraction) - ONE);
  return sorted[index] ?? ZERO;
};

const timingFor = (latenciesMs: readonly number[]): Timing => ({
  p50Ms: percentile(latenciesMs, P50),
  p95Ms: percentile(latenciesMs, P95),
  totalMs: latenciesMs.reduce((total, duration) => total + duration, ZERO),
});

const emptyUsage = (): Usage => ({
  inputTokens: ZERO,
  modelCalls: ZERO,
  outputTokens: ZERO,
});

const addUsage = (total: Usage, current: Usage): Usage => ({
  inputTokens: total.inputTokens + current.inputTokens,
  modelCalls: total.modelCalls + current.modelCalls,
  outputTokens: total.outputTokens + current.outputTokens,
});

interface RunModelOptions {
  catalog: ReturnType<typeof parseCatalog>;
  fixtures: readonly EvaluationCase[];
  keys: ProviderKeys;
  repetition: number;
  spec: ProviderSpec;
}

const runModel = async ({
  catalog,
  fixtures,
  keys,
  repetition,
  spec,
}: RunModelOptions): Promise<EvalRun> => {
  const evaluations: CaseEvaluation[] = [];
  const latenciesMs: number[] = [];
  const models = new Set<string>();
  let usage = emptyUsage();
  for (const fixture of fixtures) {
    const started = performance.now();
    const result = await infer({
      catalog,
      fixture,
      keys,
      spec,
      thresholds: THRESHOLDS,
    });
    latenciesMs.push(performance.now() - started);
    models.add(result.model);
    usage = addUsage(usage, { ...result.usage, modelCalls: ONE });
    evaluations.push(evaluateCase({ decisions: result.decisions, fixture }));
  }
  return {
    cases: fixtures.length,
    counts: summarizeEvaluations(evaluations),
    evaluations,
    failures: evaluations
      .filter((evaluation) => hasFailures(evaluation))
      .map((evaluation) => onlyFailures(evaluation)),
    latenciesMs,
    models: [...models],
    provider: spec.provider,
    repetition,
    requestedModel: spec.model,
    timing: timingFor(latenciesMs),
    usage,
  };
};

const addCounts = (
  left: EvaluationCounts,
  right: EvaluationCounts,
): EvaluationCounts => ({
  automaticExpected: left.automaticExpected + right.automaticExpected,
  automaticUnexpected: left.automaticUnexpected + right.automaticUnexpected,
  manualReviewExpected: left.manualReviewExpected + right.manualReviewExpected,
  manualReviewUnexpected:
    left.manualReviewUnexpected + right.manualReviewUnexpected,
  omittedExpected: left.omittedExpected + right.omittedExpected,
  omittedUnexpected: left.omittedUnexpected + right.omittedUnexpected,
});

const summaryFor = (
  spec: ProviderSpec,
  runs: readonly EvalRun[],
): EvalSummary => {
  const matching = runs.filter(
    (run) =>
      run.provider === spec.provider && run.requestedModel === spec.model,
  );
  const evaluations = matching.flatMap((run) => run.evaluations);
  let counts = summarizeEvaluations([]);
  let usage = emptyUsage();
  for (const run of matching) {
    counts = addCounts(counts, run.counts);
    usage = addUsage(usage, run.usage);
  }
  return {
    casesPassed: evaluations.filter((evaluation) => !hasFailures(evaluation))
      .length,
    casesTotal: evaluations.length,
    counts,
    models: [...new Set(matching.flatMap((run) => run.models))],
    provider: spec.provider,
    repetitions: matching.length,
    requestedModel: spec.model,
    runsPassed: matching.filter((run) => run.failures.length === ZERO).length,
    timing: timingFor(matching.flatMap((run) => run.latenciesMs)),
    usage,
  };
};

const runAll = async (
  options: EvalOptions,
): Promise<{
  catalogCodes: number;
  corpusCases: number;
  runs: EvalRun[];
  summaries: EvalSummary[];
  thresholds: typeof THRESHOLDS;
}> => {
  const catalog = parseCatalog(catalogData);
  const fixtures = [syntheticCasesData, sourceCasesData].flatMap((source) =>
    parseEvaluationCases(source),
  );
  const keys = {
    openai: process.env['OPENAI_API_KEY'] ?? '',
    typesafe: process.env['TYPESAFE_API_KEY'] ?? '',
  };
  const runs: EvalRun[] = [];
  for (const spec of options.specs) {
    for (
      let repetition = ONE;
      repetition <= options.repetitions;
      repetition += ONE
    ) {
      runs.push(await runModel({ catalog, fixtures, keys, repetition, spec }));
    }
  }
  return {
    catalogCodes: catalog.length,
    corpusCases: fixtures.length,
    runs,
    summaries: options.specs.map((spec) => summaryFor(spec, runs)),
    thresholds: THRESHOLDS,
  };
};

try {
  const options = parseEvalOptions(process.argv.slice(PROCESS_ARGUMENT_OFFSET));
  if (options.help) {
    process.stdout.write(HELP);
  } else {
    const output = await runAll(options);
    process.stdout.write(`${JSON.stringify(output, undefined, JSON_INDENT)}\n`);
    if (output.runs.some((run) => run.failures.length > ZERO)) {
      process.exitCode = FAILURE;
    }
  }
} catch (error: unknown) {
  let message = String(error);
  if (error instanceof Error) {
    ({ message } = error);
  }
  process.stderr.write(`codes-eval: ${message}\n`);
  process.exitCode = FAILURE;
}
