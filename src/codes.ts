import type { BillingCode, ChoiceQuestion } from './questions.ts';

import { buildQuestions } from './questions.ts';

const ZERO = 0;
const ONE = 1;
const PROBABILITY_TOLERANCE = 0.02;

type CodeResult = BillingCode & {
  confidence: number;
  likelihood: number;
  needsManualReview: boolean;
  probabilities: {
    needs_review: number;
    not_supported: number;
    supported: number;
  };
};

interface ChoiceAnswer {
  choice: 'needs_review' | 'not_supported' | 'supported';
  confidence: number;
  probabilities: Record<string, number>;
  type: 'choice';
}

interface JevRequest {
  model: string;
  questions: Record<string, ChoiceQuestion>;
  state: { dictation: string };
}

interface JevResponse {
  answers: Record<string, ChoiceAnswer>;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
}

interface ResultThresholds {
  confidence: number;
  likelihood: number;
}

interface CandidateAnswer {
  answer: ChoiceAnswer | undefined;
  candidate: BillingCode;
  id: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isProbability = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= ZERO &&
  value <= ONE;

const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Code catalog ${field} must be a non-empty string.`);
  }
  return value.trim();
};

const optionalString = (value: unknown, field: string): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  return requiredString(value, field);
};

const parseEntry = (entry: unknown, index: number): BillingCode => {
  if (!isRecord(entry)) {
    throw new Error(`Code catalog entry ${index} must be an object.`);
  }

  const code = requiredString(entry['code'], `entry ${index} code`);
  const description = requiredString(
    entry['description'],
    `entry ${index} description`,
  );
  const guidance = optionalString(entry['guidance'], `entry ${index} guidance`);
  const system = requiredString(entry['system'], `entry ${index} system`);
  const result: BillingCode = { code, description, system };
  if (guidance !== undefined) {
    result.guidance = guidance;
  }
  return result;
};

const parseCatalog = (value: unknown): BillingCode[] => {
  if (!Array.isArray(value) || value.length === ZERO) {
    throw new Error('The code catalog must be a non-empty JSON array.');
  }

  const seen = new Set<string>();
  return value.map((entry, index) => {
    const candidate = parseEntry(entry, index);
    const identity = `${candidate.system.toLowerCase()}\u0000${candidate.code.toLowerCase()}`;
    if (seen.has(identity)) {
      throw new Error(
        `Duplicate code catalog entry: ${candidate.system} ${candidate.code}.`,
      );
    }
    seen.add(identity);
    return candidate;
  });
};

const questionId = (index: number): string => `candidate_${index}`;

const buildJevRequest = (
  dictation: string,
  catalog: readonly BillingCode[],
  model: string,
): JevRequest => {
  if (dictation.trim() === '') {
    throw new Error('The dictation is empty.');
  }

  const questions = buildQuestions(catalog);
  return { model, questions, state: { dictation } };
};

const resultForCandidate = (
  candidateAnswer: CandidateAnswer,
  confidenceThreshold: number,
): CodeResult => {
  const { answer, candidate, id } = candidateAnswer;
  const supported = answer?.probabilities['supported'];
  const needsReview = answer?.probabilities['needs_review'];
  const notSupported = answer?.probabilities['not_supported'];
  if (
    answer?.type !== 'choice' ||
    !['supported', 'needs_review', 'not_supported'].includes(answer.choice) ||
    !isProbability(supported) ||
    !isProbability(needsReview) ||
    !isProbability(notSupported) ||
    !isProbability(answer.confidence) ||
    Math.abs(supported + needsReview + notSupported - ONE) >
      PROBABILITY_TOLERANCE
  ) {
    throw new Error(`Jev returned an invalid answer for ${id}.`);
  }

  return {
    ...candidate,
    confidence: answer.confidence,
    likelihood: supported + needsReview,
    needsManualReview:
      answer.choice !== 'supported' ||
      (answer.confidence < confidenceThreshold &&
        supported < confidenceThreshold),
    probabilities: {
      needs_review: needsReview,
      not_supported: notSupported,
      supported,
    },
  };
};

const readAllCodeResults = (
  response: JevResponse,
  catalog: readonly BillingCode[],
  thresholds: ResultThresholds,
): CodeResult[] =>
  catalog
    .map((candidate, index) => {
      const id = questionId(index);
      return resultForCandidate(
        { answer: response.answers[id], candidate, id },
        thresholds.confidence,
      );
    })
    .toSorted((left, right) => right.likelihood - left.likelihood);

const readCodeResults = (
  response: JevResponse,
  catalog: readonly BillingCode[],
  thresholds: ResultThresholds,
): CodeResult[] =>
  readAllCodeResults(response, catalog, thresholds)
    .filter(({ likelihood }) => likelihood >= thresholds.likelihood)
    .toSorted((left, right) => right.likelihood - left.likelihood);

export type { BillingCode } from './questions.ts';
export type { CodeResult, JevRequest, JevResponse, ResultThresholds };
export { buildJevRequest, parseCatalog, readAllCodeResults, readCodeResults };
