import assert from 'node:assert/strict';
import test from 'node:test';

import type { EvidenceCase } from '../src/evidence-evaluation.ts';
import type { EvidenceResult } from '../src/evidence.ts';

import evidenceCasesData from '../data/hand-surgery-evidence-evals.json' with { type: 'json' };
import sourceCasesData from '../data/hand-surgery-source-evals.json' with { type: 'json' };
import { parseEvaluationCases } from '../src/evaluation.ts';
import {
  evaluateEvidenceCase,
  evidenceHasFailures,
  parseEvidenceCases,
  summarizeEvidence,
} from '../src/evidence-evaluation.ts';

const fixture: EvidenceCase = {
  dictation: 'The side is not documented. A repair was performed.',
  evidenceExpectations: [
    {
      acceptedEvidence: ['side is not documented'],
      code: 'REVIEW',
      requiredTerms: ['side', 'not documented'],
      reviewCategories: ['missing_laterality'],
      system: 'TEST',
    },
    {
      acceptedEvidence: ['performed repair'],
      code: 'AUTOMATIC',
      requiredTerms: ['performed', 'repair'],
      reviewCategories: [],
      system: 'TEST',
    },
  ],
  expectedCodes: [],
  id: 'evidence-asymmetric',
};

const evidenceResult = (
  code: string,
  quote: string,
  needsManualReview: boolean,
): EvidenceResult => {
  const result: EvidenceResult = {
    code,
    confidence: 0.9,
    description: 'Test candidate',
    evidence: [{ quote }],
    likelihood: 0.9,
    needsManualReview,
    probabilities: { needs_review: 0.1, not_supported: 0, supported: 0.9 },
    system: 'TEST',
  };
  if (needsManualReview) {
    result.review = {
      action: 'Confirm the affected side.',
      category: 'missing_laterality',
    };
  }
  return result;
};

await test('scores grounding, relevance, sufficiency, review action, and stability', () => {
  const evaluation = evaluateEvidenceCase(
    fixture,
    [
      { code: 'REVIEW', disposition: 'manualReview', system: 'TEST' },
      { code: 'AUTOMATIC', disposition: 'automatic', system: 'TEST' },
    ],
    [
      evidenceResult('REVIEW', 'The side is not documented.', true),
      evidenceResult('AUTOMATIC', 'A performed repair', false),
    ],
  );

  assert.equal(evidenceHasFailures(evaluation), true);
  assert.deepEqual(summarizeEvidence([evaluation]), {
    dispositionStable: 2,
    expected: 2,
    grounded: 1,
    passed: 1,
    recalled: 2,
    reviewCategoryAccepted: 1,
    reviewExpected: 1,
    sufficient: 2,
  });
});

await test('parses satisfiable labels for all ambiguous source cases', () => {
  const fixtures = parseEvaluationCases(sourceCasesData);
  const cases = parseEvidenceCases(evidenceCasesData, fixtures);

  assert.equal(cases.length, 12);
  assert.equal(
    cases.flatMap(({ evidenceExpectations }) => evidenceExpectations).length,
    38,
  );
});
