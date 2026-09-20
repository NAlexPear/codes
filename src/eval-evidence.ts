import type { ResultThresholds } from './codes.ts';
import type {
  InferenceResult,
  ProviderKeys,
  ProviderSpec,
} from './eval-providers.ts';
import type {
  EvidenceCase,
  EvidenceCaseEvaluation,
} from './evidence-evaluation.ts';
import type { EvidenceResult } from './evidence.ts';

import { evaluateEvidenceCase } from './evidence-evaluation.ts';
import { createEnricher } from './extractor.ts';

interface EvidenceOutcome {
  evaluation: EvidenceCaseEvaluation;
  usage: { inputTokens: number; modelCalls: number; outputTokens: number };
}

interface EnrichForEvaluationOptions {
  fixture: EvidenceCase;
  keys: ProviderKeys;
  result: InferenceResult;
  spec: ProviderSpec;
  thresholds: ResultThresholds;
}

const hasEvidence = (result: unknown): result is EvidenceResult => {
  if (
    typeof result !== 'object' ||
    result === null ||
    !('evidence' in result)
  ) {
    return false;
  }
  return Array.isArray(result.evidence);
};

const enrichForEvaluation = async (
  options: EnrichForEvaluationOptions,
): Promise<EvidenceOutcome> => {
  if (options.result.selected === undefined) {
    throw new Error('Evidence evaluation requires Jev results.');
  }
  const extraction = await createEnricher({
    apiKey: options.keys.typesafe,
    model: options.spec.model,
  })(options.fixture.dictation, {
    manualReview: options.result.selected.filter(
      ({ needsManualReview }) => needsManualReview,
    ),
    matches: options.result.selected.filter(
      ({ needsManualReview }) => !needsManualReview,
    ),
    model: options.result.model,
    thresholds: options.thresholds,
    usage: {
      input_tokens: options.result.usage.inputTokens,
      output_tokens: options.result.usage.outputTokens,
    },
  });
  const enriched = [...extraction.matches, ...extraction.manualReview];
  if (!enriched.every((code) => hasEvidence(code))) {
    throw new Error(
      `Evidence enrichment was incomplete for ${options.fixture.id}.`,
    );
  }
  return {
    evaluation: evaluateEvidenceCase(
      options.fixture,
      options.result.decisions,
      enriched,
    ),
    usage: {
      inputTokens: extraction.usage.input_tokens,
      modelCalls: 2,
      outputTokens: extraction.usage.output_tokens,
    },
  };
};

export type { EvidenceOutcome };
export { enrichForEvaluation };
