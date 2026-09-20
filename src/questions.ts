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
        'The service family appears to have been performed, but a required approach, extent, anatomy, or separate-reporting detail is omitted, indeterminate, or internally conflicting.',
        'The dictation contains mutually conflicting values for a candidate-specific detail, and the candidate matches one documented alternative.',
      ],
      what: 'The candidate is clinically plausible, but the dictation alone is insufficient for a reliable coding decision.',
    },
    not_supported: {
      reasons: [
        'The service is only planned, historical, or mentioned as a diagnosis.',
        'A different procedure, anatomy, approach, or extent is documented.',
        'The dictation unambiguously documents a mutually exclusive candidate-specific detail that does not match this candidate.',
        'The performed service lacks a defining clinical component of the candidate, rather than merely leaving a coding detail ambiguous.',
      ],
      what: 'The current encounter does not document that this procedure was performed.',
    },
    supported: {
      evidence: [
        'The operative description documents the performed service represented by the candidate.',
        'The anatomy, procedure type, approach, and extent match every distinguishing detail in the candidate description.',
        'Standard clinical synonyms and equivalent operative wording count as matches.',
        'A base service described for one unit or digit remains supported when it was performed and additional units or digits are documented for a separate add-on service.',
      ],
      what: 'The current encounter documents that this procedure was performed.',
    },
  },
  instructions: {
    candidate,
    decision_order: [
      'Apply the candidate-specific guidance first, then decide whether the performed service broadly matches the candidate’s procedure family. If not, choose not_supported.',
      'When every documented candidate-specific detail matches, choose supported.',
      'When the dictation clearly documents a mutually exclusive approach, extent, anatomy, or other detail, choose not_supported for the nonmatching candidate even when it belongs to the same procedure family.',
      'Choose needs_review only when the service family matches and a required distinction is genuinely omitted, indeterminate, or internally conflicting.',
    ],
    focus:
      'Compare clinical meaning rather than exact wording. Do not infer ambiguity merely because nearby catalog candidates exist. An explicit nonmatching detail contradicts a candidate; only a genuinely unresolved detail requires review.',
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
        'The diagnosis category is established, but required etiology, anatomy, laterality, digit, or encounter-status evidence is omitted or indeterminate.',
        'Different parts of the dictation explicitly document conflicting anatomy, laterality, or digit values; candidates matching either documented alternative require review.',
        'A documented TFCC tear with no clear traumatic or degenerative etiology makes a wrist sprain candidate a review case.',
      ],
      what: 'The candidate may apply, but the dictation alone is insufficient for a reliable coding decision.',
    },
    not_supported: {
      reasons: [
        'The condition is ruled out, historical, merely planned for evaluation, or absent.',
        'The dictation unambiguously identifies a different side, digit, structure, etiology, or encounter status, even when this candidate belongs to the same diagnosis family.',
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
      'Apply the candidate-specific guidance first. Assess the diagnosis independently from any related procedure: whether a procedure was planned, completed, aborted, or procedurally ambiguous does not determine diagnosis support.',
      'First decide whether the documented condition broadly matches the candidate’s diagnosis family. If not, choose not_supported.',
      'Compare every explicitly documented candidate-specific characteristic, including anatomy, side, digit, etiology, and encounter status.',
      'When the record unambiguously documents a mutually exclusive characteristic that differs from the candidate, choose not_supported; a nearby code in the same diagnosis family is not thereby plausible.',
      'When the record explicitly conflicts about a candidate-specific characteristic such as side or digit, choose needs_review for every candidate matching a documented alternative; do not treat either alternative as not_supported.',
      'When the diagnosis family matches but a required characteristic is genuinely omitted or indeterminate, choose needs_review.',
      'When all required characteristics match, choose supported.',
    ],
    focus:
      'Compare clinical meaning rather than exact wording. Procedure approach, extent, or completion uncertainty must not lower an otherwise explicit diagnosis. Do not infer ambiguity merely because nearby catalog candidates exist: explicit nonmatching specificity means not_supported, while omitted, indeterminate, or internally conflicting specificity means needs_review.',
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
