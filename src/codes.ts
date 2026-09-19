const ZERO = 0;
const ONE = 1;
const PROBABILITY_TOLERANCE = 0.001;

interface BillingCode {
  code: string;
  description: string;
  guidance?: string;
  system: string;
}

type CodeResult = BillingCode & {
  confidence: number;
  likelihood: number;
  needsManualReview: boolean;
  probabilities: { not_supported: number; supported: number };
};

interface ChoiceQuestion {
  criteria: { not_supported: string; supported: string };
  instructions: { candidate: BillingCode; rules: string[]; task: string };
  type: 'choice';
}

interface ChoiceAnswer {
  choice: 'supported' | 'not_supported';
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

  const questions = Object.fromEntries(
    catalog.map((candidate, index) => [
      questionId(index),
      {
        criteria: {
          not_supported:
            'The candidate is absent, historical, planned, ruled out, contradicted, or lacks required specificity.',
          supported:
            'The current encounter explicitly documents the candidate with the specificity needed to support it.',
        },
        instructions: {
          candidate,
          rules: [
            'Judge only the candidate shown in this question.',
            'Require documentation of the diagnosis, service, or procedure represented by the candidate.',
            'Do not infer undocumented details such as laterality, approach, extent, or complications.',
            'A mention in history, a planned future service, or a ruled-out diagnosis is not support for coding the current encounter.',
          ],
          task: 'Choose whether the dictation explicitly supports this billing code candidate.',
        },
        type: 'choice' as const,
      },
    ]),
  );
  return { model, questions, state: { dictation } };
};

const resultForCandidate = (
  candidateAnswer: CandidateAnswer,
  confidenceThreshold: number,
): CodeResult => {
  const { answer, candidate, id } = candidateAnswer;
  const supported = answer?.probabilities['supported'];
  const notSupported = answer?.probabilities['not_supported'];
  if (
    answer?.type !== 'choice' ||
    !['supported', 'not_supported'].includes(answer.choice) ||
    !isProbability(supported) ||
    !isProbability(notSupported) ||
    !isProbability(answer.confidence) ||
    Math.abs(supported + notSupported - ONE) > PROBABILITY_TOLERANCE
  ) {
    throw new Error(`Jev returned an invalid answer for ${id}.`);
  }

  return {
    ...candidate,
    confidence: answer.confidence,
    likelihood: supported,
    needsManualReview: answer.confidence < confidenceThreshold,
    probabilities: { not_supported: notSupported, supported },
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

export type {
  BillingCode,
  CodeResult,
  JevRequest,
  JevResponse,
  ResultThresholds,
};
export { buildJevRequest, parseCatalog, readAllCodeResults, readCodeResults };
