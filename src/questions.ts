interface BillingCode {
  code: string;
  description: string;
  guidance?: string;
  system: string;
}

interface ChoiceQuestion {
  criteria: {
    needs_review: { reasons: string[]; what: string };
    not_supported: { reasons: string[]; what: string };
    supported: { evidence: string[]; what: string };
  };
  instructions: {
    candidate: BillingCode;
    decision_order: string[];
    focus: string;
    inspect: string;
    question: string;
  };
  type: 'choice';
}

const cptQuestion = (candidate: BillingCode): ChoiceQuestion => ({
  criteria: {
    needs_review: {
      reasons: [
        'The service appears to have been performed, but the note leaves a coding distinction unresolved.',
        'A required approach, extent, anatomy, or separate-reporting detail needs expert interpretation.',
      ],
      what: 'The candidate is clinically plausible, but the dictation alone is insufficient for a reliable coding decision.',
    },
    not_supported: {
      reasons: [
        'The service is only planned, historical, or mentioned as a diagnosis.',
        'A different procedure, anatomy, approach, or extent is documented.',
        'The performed service lacks a defining clinical component of the candidate, rather than merely leaving a coding detail ambiguous.',
      ],
      what: 'The current encounter does not document that this procedure was performed.',
    },
    supported: {
      evidence: [
        'The operative description documents the performed service represented by the candidate.',
        'The anatomy, procedure type, approach, and extent match every distinguishing detail in the candidate description.',
        'Standard clinical synonyms and equivalent operative wording count as matches.',
      ],
      what: 'The current encounter documents that this procedure was performed.',
    },
  },
  instructions: {
    candidate,
    decision_order: [
      'Choose supported when the performed service matches the candidate’s defining clinical components.',
      'Choose needs_review only when the service matches clinically but a coding distinction cannot be resolved from the dictation.',
      'Choose not_supported when the service is absent, contradicted, or clinically different.',
    ],
    focus:
      'Compare clinical meaning rather than exact wording. Use needs_review, not not_supported, when the service is plausible but a coding distinction remains unresolved.',
    inspect: '`dictation`',
    question:
      'Does `dictation` support reporting this CPT procedure candidate for the current encounter?',
  },
  type: 'choice',
});

const diagnosisQuestion = (candidate: BillingCode): ChoiceQuestion => ({
  criteria: {
    needs_review: {
      reasons: [
        'The diagnosis category is plausible, but required etiology, anatomy, laterality, or encounter-status evidence is missing or ambiguous.',
        'Choosing this candidate over a nearby diagnosis requires chart context not present in the dictation.',
        'Different parts of the dictation explicitly document conflicting anatomy, laterality, or digit values; candidates matching either documented alternative require review.',
        'A documented TFCC tear with no clear traumatic or degenerative etiology makes a wrist sprain candidate a review case.',
      ],
      what: 'The candidate may apply, but the dictation alone is insufficient for a reliable coding decision.',
    },
    not_supported: {
      reasons: [
        'The condition is ruled out, historical, merely planned for evaluation, or absent.',
        'The documented anatomy, laterality, diagnosis, or encounter status conflicts with the candidate.',
        'The candidate is a symptom that is explained by a documented definitive diagnosis.',
      ],
      what: 'The current encounter does not establish the diagnosis represented by the candidate.',
    },
    supported: {
      evidence: [
        'The current diagnosis, findings, or treatment establish the condition represented by the candidate.',
        'The documented anatomy and laterality match the candidate.',
        'Standard clinical synonyms and equivalent diagnostic terminology count as matches.',
        'An explicit current diagnosis remains supported when a related procedure is planned, incomplete, or ambiguous, unless a characteristic required by this diagnosis candidate is itself unresolved.',
        'A distal-forearm diagnosis candidate can match wrist tendon-sheath documentation when it describes the same structure, side, and condition.',
        'A documented ligament or fibrocartilage tear can support a sprain-category candidate when its anatomy and laterality match.',
        'For an injury code, surgery or other active treatment supports an initial-encounter designation; it need not be the patient’s first visit.',
      ],
      what: 'The current encounter establishes the diagnosis represented by the candidate.',
    },
  },
  instructions: {
    candidate,
    decision_order: [
      'Assess the diagnosis independently from any related procedure: whether a procedure was planned, completed, aborted, or procedurally ambiguous does not determine diagnosis support.',
      'Decide whether the documented condition broadly matches the candidate’s diagnosis category, anatomy, and laterality.',
      'When the record explicitly conflicts about a candidate-specific characteristic such as side or digit, choose needs_review for every candidate matching a documented alternative; do not treat either alternative as not_supported.',
      'If it broadly matches but required coding specificity is missing or ambiguous, choose needs_review.',
      'Choose not_supported only when the underlying condition is absent, contradicted, or clinically different.',
    ],
    focus:
      'Compare clinical meaning rather than exact wording. Procedure approach, extent, or completion uncertainty must not lower an otherwise explicit diagnosis. Use needs_review, not not_supported, when candidate-specific diagnosis evidence is conflicting, absent, or ambiguous.',
    inspect: '`dictation`',
    question:
      'Does `dictation` support assigning this ICD-10-CM diagnosis candidate for the current encounter?',
  },
  type: 'choice',
});

const questionFor = (candidate: BillingCode): ChoiceQuestion => {
  if (candidate.system.toUpperCase() === 'CPT') {
    return cptQuestion(candidate);
  }
  return diagnosisQuestion(candidate);
};

const buildQuestions = (
  catalog: readonly BillingCode[],
): Record<string, ChoiceQuestion> =>
  Object.fromEntries(
    catalog.map((candidate, index) => [
      `candidate_${index}`,
      questionFor(candidate),
    ]),
  );

export type { BillingCode, ChoiceQuestion };
export { buildQuestions };
