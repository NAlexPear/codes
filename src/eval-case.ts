import type { BillingCode, ResultThresholds } from './codes.ts';
import type { ProviderKeys, ProviderSpec } from './eval-providers.ts';
import type { EvalRun } from './eval.ts';
import type { CaseEvaluation, EvaluationCase } from './evaluation.ts';
import type {
  EvidenceCase,
  EvidenceCaseEvaluation,
} from './evidence-evaluation.ts';

import { enrichForEvaluation } from './eval-evidence.ts';
import { infer } from './eval-providers.ts';
import { evaluateCase } from './evaluation.ts';
import {
  evidenceHasFailures,
  summarizeEvidence,
} from './evidence-evaluation.ts';

const ZERO = 0;
const ONE = 1;

interface EvalCaseOptions {
  catalog: readonly BillingCode[];
  fixture: EvaluationCase | EvidenceCase;
  keys: ProviderKeys;
  spec: ProviderSpec;
  thresholds: ResultThresholds;
}

interface EvalCaseResult {
  evaluation: CaseEvaluation;
  evidence?: EvidenceCaseEvaluation;
  latencyMs: number;
  model: string;
  usage: { inputTokens: number; modelCalls: number; outputTokens: number };
}

const runEvalCase = async (
  options: EvalCaseOptions,
): Promise<EvalCaseResult> => {
  const started = performance.now();
  const result = await infer(options);
  let usage = { ...result.usage, modelCalls: ONE };
  let evidence: EvidenceCaseEvaluation | undefined = undefined;
  if ('evidenceExpectations' in options.fixture) {
    const { evaluation, usage: evidenceUsage } = await enrichForEvaluation({
      fixture: options.fixture,
      keys: options.keys,
      result,
      spec: options.spec,
      thresholds: options.thresholds,
    });
    evidence = evaluation;
    usage = evidenceUsage;
  }
  const evaluated: EvalCaseResult = {
    evaluation: evaluateCase({
      decisions: result.decisions,
      fixture: options.fixture,
    }),
    latencyMs: performance.now() - started,
    model: result.model,
    usage,
  };
  if (evidence !== undefined) {
    evaluated.evidence = evidence;
  }
  return evaluated;
};

const withEvidence = (
  run: EvalRun,
  evaluations: EvidenceCaseEvaluation[],
): EvalRun => {
  if (evaluations.length > ZERO) {
    run.evidence = {
      counts: summarizeEvidence(evaluations),
      evaluations,
      failures: evaluations.filter((evaluation) =>
        evidenceHasFailures(evaluation),
      ),
    };
  }
  return run;
};

export type { EvalCaseOptions, EvalCaseResult };
export { runEvalCase, withEvidence };
