import type {
  BillingCode,
  CodeResult,
  JevResponse,
  ResultThresholds,
} from './codes.ts';

import { readAllCodeResults } from './codes.ts';

type Disposition = 'automatic' | 'manualReview' | 'omitted';

interface CodeIdentity {
  code: string;
  system: string;
}

interface ExpectedCode extends CodeIdentity {
  acceptedDispositions: readonly Disposition[];
}

interface EvaluationCase {
  dictation: string;
  expectedCodes: ExpectedCode[];
  id: string;
}

type EvaluatedCode = CodeResult & {
  accepted: boolean;
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

const identity = ({ code, system }: CodeIdentity): string =>
  `${system.toLowerCase()}\u0000${code.toLowerCase()}`;

const isExpectedDisposition = (value: unknown): value is Disposition =>
  value === 'automatic' || value === 'manualReview';

const readAcceptedDispositions = (
  value: unknown,
  field: string,
): readonly Disposition[] => {
  if (value === undefined) {
    return ['automatic', 'manualReview'];
  }
  if (!Array.isArray(value) || value.length === ZERO) {
    throw new TypeError(`${field} must be a non-empty array.`);
  }
  const dispositions: Disposition[] = [];
  const values: unknown[] = value;
  for (const disposition of values) {
    if (!isExpectedDisposition(disposition)) {
      throw new TypeError(`${field} contains an invalid disposition.`);
    }
    dispositions.push(disposition);
  }
  return [...new Set(dispositions)];
};

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
      return {
        acceptedDispositions: readAcceptedDispositions(
          candidate['accepted_dispositions'],
          `Evaluation fixture ${key} accepted_dispositions`,
        ),
        code: requiredString(candidate['code'], 'code'),
        system,
      };
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
  const expected = new Map(
    fixture.expectedCodes.map((code) => [identity(code), code]),
  );
  const codes = readAllCodeResults(response, catalog, thresholds).map(
    (result) => {
      const disposition = dispositionFor(result, thresholds);
      const expectedCode = expected.get(identity(result));
      return Object.assign(result, {
        accepted:
          expectedCode?.acceptedDispositions.includes(disposition) ??
          disposition !== 'automatic',
        disposition,
        expected: expectedCode !== undefined,
      });
    },
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

const isFailure = ({ accepted }: EvaluatedCode): boolean => !accepted;

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
