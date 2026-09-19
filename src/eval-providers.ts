import type { BillingCode, JevResponse, ResultThresholds } from './codes.ts';
import type {
  CodeDecision,
  Disposition,
  EvaluationCase,
} from './evaluation.ts';
import type { OpenAIChoice } from './openai.ts';

import { buildJevRequest, readAllCodeResults } from './codes.ts';
import { askOpenAI, buildOpenAIRequest } from './openai.ts';
import { askJev } from './typesafe.ts';

type ProviderName = 'jev' | 'openai';

interface ProviderSpec {
  model: string;
  provider: ProviderName;
}

interface ProviderKeys {
  openai: string;
  typesafe: string;
}

interface InferenceOptions {
  catalog: readonly BillingCode[];
  fixture: EvaluationCase;
  keys: ProviderKeys;
  spec: ProviderSpec;
  thresholds: ResultThresholds;
}

interface InferenceResult {
  decisions: CodeDecision[];
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

const dispositionForJev = (
  likelihood: number,
  needsManualReview: boolean,
  thresholds: ResultThresholds,
): Disposition => {
  if (likelihood < thresholds.likelihood) {
    return 'omitted';
  }
  if (needsManualReview) {
    return 'manualReview';
  }
  return 'automatic';
};

const decisionsFromJev = (
  response: JevResponse,
  catalog: readonly BillingCode[],
  thresholds: ResultThresholds,
): CodeDecision[] =>
  readAllCodeResults(response, catalog, thresholds).map((result) =>
    Object.assign(result, {
      disposition: dispositionForJev(
        result.likelihood,
        result.needsManualReview,
        thresholds,
      ),
    }),
  );

const dispositionForOpenAI = (choice: OpenAIChoice): Disposition => {
  if (choice === 'supported') {
    return 'automatic';
  }
  if (choice === 'needs_review') {
    return 'manualReview';
  }
  return 'omitted';
};

const decisionsFromOpenAI = (
  choices: Readonly<Record<string, OpenAIChoice>>,
  catalog: readonly BillingCode[],
): CodeDecision[] =>
  catalog.map((candidate, index) => {
    const id = `candidate_${index}`;
    const choice = choices[id];
    if (choice === undefined) {
      throw new Error(`OpenAI result is missing ${id}.`);
    }
    return { ...candidate, disposition: dispositionForOpenAI(choice) };
  });

const inferJev = async ({
  catalog,
  fixture,
  keys,
  spec,
  thresholds,
}: InferenceOptions): Promise<InferenceResult> => {
  const response = await askJev(
    buildJevRequest(fixture.dictation, catalog, spec.model),
    { apiKey: keys.typesafe },
  );
  return {
    decisions: decisionsFromJev(response, catalog, thresholds),
    model: response.model,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
};

const inferOpenAI = async ({
  catalog,
  fixture,
  keys,
  spec,
}: InferenceOptions): Promise<InferenceResult> => {
  const response = await askOpenAI(
    buildOpenAIRequest(fixture.dictation, catalog, spec.model),
    { apiKey: keys.openai },
  );
  return {
    decisions: decisionsFromOpenAI(response.choices, catalog),
    model: response.model,
    usage: response.usage,
  };
};

const infer = (options: InferenceOptions): Promise<InferenceResult> => {
  if (options.spec.provider === 'jev') {
    return inferJev(options);
  }
  return inferOpenAI(options);
};

export type {
  InferenceOptions,
  InferenceResult,
  ProviderKeys,
  ProviderName,
  ProviderSpec,
};
export { decisionsFromJev, decisionsFromOpenAI, infer };
