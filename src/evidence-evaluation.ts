import type { ReviewCategory } from './codes.ts';
import type { Disposition, EvaluationCase } from './evaluation.ts';
import type { EvidenceResult } from './evidence.ts';

import { identity, validateExpectations } from './evidence-labels.ts';

const ZERO = 0;
const INCREMENT = 1;

interface EvidenceExpectation {
  acceptedEvidence: string[];
  code: string;
  requiredTerms: string[];
  reviewCategories: ReviewCategory[];
  system: string;
}

interface EvidenceCase extends EvaluationCase {
  evidenceExpectations: EvidenceExpectation[];
}

interface EvidenceCodeEvaluation {
  accepted: boolean;
  code: string;
  dispositionStable: boolean;
  evidence: string[];
  grounded: boolean;
  recalled: boolean;
  reviewCategory?: ReviewCategory;
  reviewCategoryAccepted: boolean;
  reviewCategoryRequired: boolean;
  sufficient: boolean;
  system: string;
}

interface EvidenceCaseEvaluation {
  codes: EvidenceCodeEvaluation[];
  id: string;
}

interface EvidenceCounts {
  dispositionStable: number;
  expected: number;
  grounded: number;
  passed: number;
  recalled: number;
  reviewCategoryAccepted: number;
  reviewExpected: number;
  sufficient: number;
}

interface EvidenceDecision {
  code: string;
  disposition: Disposition;
  system: string;
}

interface EvaluateExpectationOptions {
  decision: EvidenceDecision | undefined;
  dictation: string;
  expectation: EvidenceExpectation;
  result: EvidenceResult | undefined;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const includes = (text: string, term: string): boolean =>
  text.toLowerCase().includes(term.toLowerCase());

const strings = (value: unknown, field: string): string[] => {
  if (!Array.isArray(value) || value.length === ZERO) {
    throw new TypeError(`${field} must be a non-empty array.`);
  }
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.trim() === '') {
      throw new TypeError(`${field} must contain non-empty strings.`);
    }
    result.push(entry);
  }
  return result;
};

const isReviewCategory = (value: string): value is ReviewCategory =>
  [
    'conflicting_documentation',
    'missing_anatomy',
    'missing_encounter_status',
    'missing_etiology',
    'missing_laterality',
    'missing_procedure_detail',
    'other_ambiguity',
    'separate_reporting',
  ].includes(value);

const reviewCategories = (value: unknown, field: string): ReviewCategory[] => {
  if (value === undefined) {
    return [];
  }
  const values = strings(value, field);
  if (!values.every((entry) => isReviewCategory(entry))) {
    throw new TypeError(`${field} contains an invalid review category.`);
  }
  return values;
};

const parseExpectation = (value: unknown): EvidenceExpectation => {
  if (!isRecord(value)) {
    throw new TypeError('Evidence expectation must be an object.');
  }
  const { code } = value;
  const { system } = value;
  if (typeof code !== 'string' || typeof system !== 'string') {
    throw new TypeError('Evidence expectation requires code and system.');
  }
  return {
    acceptedEvidence: strings(
      value['accepted_evidence'],
      `Evidence expectation ${code} accepted_evidence`,
    ),
    code,
    requiredTerms: strings(
      value['required_terms'],
      `Evidence expectation ${code} required_terms`,
    ),
    reviewCategories: reviewCategories(
      value['review_categories'],
      `Evidence expectation ${code} review_categories`,
    ),
    system,
  };
};

const parseEvidenceCases = (
  value: unknown,
  fixtures: readonly EvaluationCase[],
): EvidenceCase[] => {
  if (!Array.isArray(value) || value.length === ZERO) {
    throw new TypeError('Evidence evaluations must be a non-empty array.');
  }
  const byId = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  return value.map((entry) => {
    if (!isRecord(entry) || typeof entry['id'] !== 'string') {
      throw new TypeError('Evidence evaluation requires an id.');
    }
    const fixture = byId.get(entry['id']);
    if (fixture === undefined || !Array.isArray(entry['expectations'])) {
      throw new Error(`Evidence evaluation fixture ${entry['id']} is invalid.`);
    }
    const expectations = entry['expectations'].map(parseExpectation);
    validateExpectations(fixture, expectations);
    return { ...fixture, evidenceExpectations: expectations };
  });
};

const reviewAccepted = (
  decision: EvidenceDecision | undefined,
  result: EvidenceResult | undefined,
  expectation: EvidenceExpectation,
): boolean =>
  decision?.disposition !== 'manualReview' ||
  (result?.review !== undefined &&
    expectation.reviewCategories.includes(result.review.category));

const evaluateExpectation = ({
  decision,
  dictation,
  expectation,
  result,
}: EvaluateExpectationOptions): EvidenceCodeEvaluation => {
  const evidence = result?.evidence.map(({ quote }) => quote) ?? [];
  const combined = evidence.join('\n');
  const grounded =
    evidence.length > ZERO &&
    evidence.every((quote) => dictation.includes(quote));
  const recalled = expectation.acceptedEvidence.some((term) =>
    includes(combined, term),
  );
  const sufficient = expectation.requiredTerms.every((term) =>
    includes(combined, term),
  );
  const dispositionStable =
    decision !== undefined &&
    result?.needsManualReview === (decision.disposition === 'manualReview');
  const reviewCategoryAccepted = reviewAccepted(decision, result, expectation);
  const reviewCategoryRequired = decision?.disposition === 'manualReview';
  const evaluated: EvidenceCodeEvaluation = {
    accepted:
      grounded &&
      recalled &&
      sufficient &&
      dispositionStable &&
      reviewCategoryAccepted,
    code: expectation.code,
    dispositionStable,
    evidence,
    grounded,
    recalled,
    reviewCategoryAccepted,
    reviewCategoryRequired,
    sufficient,
    system: expectation.system,
  };
  if (result?.review !== undefined) {
    evaluated.reviewCategory = result.review.category;
  }
  return evaluated;
};

const evaluateEvidenceCase = (
  fixture: EvidenceCase,
  decisions: readonly EvidenceDecision[],
  results: readonly EvidenceResult[],
): EvidenceCaseEvaluation => {
  const byDecision = new Map(
    decisions.map((decision) => [
      identity(decision.system, decision.code),
      decision,
    ]),
  );
  const byResult = new Map(
    results.map((result) => [identity(result.system, result.code), result]),
  );
  const codes = fixture.evidenceExpectations.map((expectation) => {
    const key = identity(expectation.system, expectation.code);
    return evaluateExpectation({
      decision: byDecision.get(key),
      dictation: fixture.dictation,
      expectation,
      result: byResult.get(key),
    });
  });
  return { codes, id: fixture.id };
};

const summarizeEvidence = (
  evaluations: readonly EvidenceCaseEvaluation[],
): EvidenceCounts => {
  const counts: EvidenceCounts = {
    dispositionStable: ZERO,
    expected: ZERO,
    grounded: ZERO,
    passed: ZERO,
    recalled: ZERO,
    reviewCategoryAccepted: ZERO,
    reviewExpected: ZERO,
    sufficient: ZERO,
  };
  const metrics = [
    'dispositionStable',
    'grounded',
    'recalled',
    'sufficient',
  ] as const;
  for (const code of evaluations.flatMap(({ codes }) => codes)) {
    counts.expected += INCREMENT;
    if (code.accepted) {
      counts.passed += INCREMENT;
    }
    if (code.reviewCategoryRequired) {
      counts.reviewExpected += INCREMENT;
      if (code.reviewCategoryAccepted) {
        counts.reviewCategoryAccepted += INCREMENT;
      }
    }
    for (const metric of metrics) {
      if (code[metric]) {
        counts[metric] += INCREMENT;
      }
    }
  }
  return counts;
};

const evidenceHasFailures = (evaluation: EvidenceCaseEvaluation): boolean =>
  evaluation.codes.some(({ accepted }) => !accepted);

export type {
  EvidenceCase,
  EvidenceCaseEvaluation,
  EvidenceCounts,
  EvidenceExpectation,
};
export {
  evaluateEvidenceCase,
  evidenceHasFailures,
  parseEvidenceCases,
  summarizeEvidence,
};
