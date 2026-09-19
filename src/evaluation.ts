import type {
  BillingCode,
  CodeResult,
  JevResponse,
  ResultThresholds,
} from './codes.ts';

import { readAllCodeResults } from './codes.ts';

type Disposition = 'automatic' | 'manualReview' | 'omitted';

interface ExpectedCode {
  code: string;
  system: string;
}

interface EvaluationCase {
  dictation: string;
  expectedCodes: ExpectedCode[];
  id: string;
}

type EvaluatedCode = CodeResult & {
  disposition: Disposition;
  expected: boolean;
};

interface CaseEvaluation {
  codes: EvaluatedCode[];
  id: string;
}

interface EvaluationCounts {
  automaticExpected: number;
  automaticUnexpected: number;
  manualReviewExpected: number;
  manualReviewUnexpected: number;
  omittedExpected: number;
  omittedUnexpected: number;
}

interface EvaluateCaseOptions {
  catalog: readonly BillingCode[];
  fixture: EvaluationCase;
  response: JevResponse;
  thresholds: ResultThresholds;
}

const ZERO = 0;
const INCREMENT = 1;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Evaluation fixture ${field} must be a non-empty string.`);
  }
  return value;
};

const identity = ({ code, system }: ExpectedCode): string =>
  `${system.toLowerCase()}\u0000${code.toLowerCase()}`;

const readCandidates = (billing: Record<string, unknown>): ExpectedCode[] => {
  const systems = [
    ['cpt', 'CPT'],
    ['icd10cm', 'ICD-10-CM'],
  ] as const;
  return systems.flatMap(([key, system]) => {
    const candidates = billing[key];
    if (!Array.isArray(candidates)) {
      throw new TypeError(`Evaluation fixture ${key} must be an array.`);
    }
    return candidates.map((candidate) => {
      if (!isRecord(candidate)) {
        throw new TypeError(
          `Evaluation fixture ${key} entry must be an object.`,
        );
      }
      return { code: requiredString(candidate['code'], 'code'), system };
    });
  });
};

const parseEvaluationCases = (value: unknown): EvaluationCase[] => {
  if (!Array.isArray(value) || value.length === ZERO) {
    throw new Error('Evaluation corpus must be a non-empty array.');
  }
  return value.map((fixture) => {
    if (!isRecord(fixture) || !isRecord(fixture['billing_candidates'])) {
      throw new TypeError(
        'Evaluation fixture must contain billing_candidates.',
      );
    }
    return {
      dictation: JSON.stringify(fixture['dictation']),
      expectedCodes: readCandidates(fixture['billing_candidates']),
      id: requiredString(fixture['id'], 'id'),
    };
  });
};

const dispositionFor = (
  result: CodeResult,
  thresholds: ResultThresholds,
): Disposition => {
  if (result.likelihood < thresholds.likelihood) {
    return 'omitted';
  }
  if (result.needsManualReview) {
    return 'manualReview';
  }
  return 'automatic';
};

const evaluateCase = ({
  catalog,
  fixture,
  response,
  thresholds,
}: EvaluateCaseOptions): CaseEvaluation => {
  const expected = new Set(fixture.expectedCodes.map(identity));
  const codes = readAllCodeResults(response, catalog, thresholds).map(
    (result) =>
      Object.assign(result, {
        disposition: dispositionFor(result, thresholds),
        expected: expected.has(identity(result)),
      }),
  );
  return { codes, id: fixture.id };
};

const emptyCounts = (): EvaluationCounts => ({
  automaticExpected: ZERO,
  automaticUnexpected: ZERO,
  manualReviewExpected: ZERO,
  manualReviewUnexpected: ZERO,
  omittedExpected: ZERO,
  omittedUnexpected: ZERO,
});

const countKey = (code: EvaluatedCode): keyof EvaluationCounts => {
  let suffix: 'Expected' | 'Unexpected' = 'Unexpected';
  if (code.expected) {
    suffix = 'Expected';
  }
  return `${code.disposition}${suffix}`;
};

const summarizeEvaluations = (
  evaluations: readonly CaseEvaluation[],
): EvaluationCounts => {
  const counts = emptyCounts();
  for (const { codes } of evaluations) {
    for (const code of codes) {
      counts[countKey(code)] += INCREMENT;
    }
  }
  return counts;
};

const isFailure = ({ disposition, expected }: EvaluatedCode): boolean => {
  if (expected) {
    return disposition === 'omitted';
  }
  return disposition === 'automatic';
};

const hasFailures = ({ codes }: CaseEvaluation): boolean =>
  codes.some((code) => isFailure(code));

const onlyFailures = ({ codes, id }: CaseEvaluation): CaseEvaluation => ({
  codes: codes.filter((code) => isFailure(code)),
  id,
});

export type { CaseEvaluation, EvaluatedCode, EvaluationCase, EvaluationCounts };
export {
  evaluateCase,
  hasFailures,
  onlyFailures,
  parseEvaluationCases,
  summarizeEvaluations,
};
