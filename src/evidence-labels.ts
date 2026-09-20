import type { EvaluationCase } from './evaluation.ts';
import type { EvidenceExpectation } from './evidence-evaluation.ts';

const ZERO = 0;

const identity = (system: string, code: string): string =>
  `${system.toLowerCase()}\u0000${code.toLowerCase()}`;

const includes = (text: string, term: string): boolean =>
  text.toLowerCase().includes(term.toLowerCase());

const validateExpectations = (
  fixture: EvaluationCase,
  expectations: readonly EvidenceExpectation[],
): void => {
  const expectedCodes = new Set(
    fixture.expectedCodes.map(({ code, system }) => identity(system, code)),
  );
  const identities = expectations.map(({ code, system }) =>
    identity(system, code),
  );
  if (
    new Set(identities).size !== identities.length ||
    identities.some((candidate) => !expectedCodes.has(candidate))
  ) {
    throw new Error(
      `Evidence evaluation fixture ${fixture.id} has invalid candidates.`,
    );
  }
  for (const expectation of expectations) {
    const candidate = fixture.expectedCodes.find(
      ({ code, system }) =>
        identity(system, code) ===
        identity(expectation.system, expectation.code),
    );
    if (
      expectation.acceptedEvidence.every(
        (term) => !includes(fixture.dictation, term),
      ) ||
      expectation.requiredTerms.some(
        (term) => !includes(fixture.dictation, term),
      ) ||
      (candidate?.acceptedDispositions.includes('manualReview') === true &&
        expectation.reviewCategories.length === ZERO)
    ) {
      throw new Error(
        `Evidence evaluation fixture ${fixture.id} has unsatisfiable labels for ${expectation.code}.`,
      );
    }
  }
};

export { identity, validateExpectations };
