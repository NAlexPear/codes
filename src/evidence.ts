import type { CodeResult, ReviewCategory } from './codes.ts';
import type {
  ChoiceAnswer,
  ChoiceRequest,
  ChoiceResponse,
} from './typesafe.ts';

const ZERO = 0;

const REVIEW_ACTIONS: Record<ReviewCategory, string> = {
  conflicting_documentation:
    'Resolve the conflicting documentation before assigning this code.',
  missing_anatomy: 'Confirm the specific structure, digit, or anatomical site.',
  missing_encounter_status:
    'Confirm whether this is active treatment, subsequent care, or a sequela.',
  missing_etiology: 'Confirm the cause or pathology required by this code.',
  missing_laterality: 'Confirm the affected side.',
  missing_procedure_detail:
    'Confirm the required procedure approach, extent, or completion detail.',
  other_ambiguity:
    'Review the source documentation and resolve the remaining coding ambiguity.',
  separate_reporting:
    'Confirm that this service is separately reportable and not bundled.',
};

interface Evidence {
  quote: string;
}

interface ReviewAction {
  action: string;
  category: ReviewCategory;
}

interface EvidenceResult extends CodeResult {
  evidence: Evidence[];
  review?: ReviewAction;
}

interface EvidenceChoiceQuestion {
  criteria: Record<string, { what: string }>;
  instructions: Record<string, unknown>;
  type: 'choice';
}

const splitSentences = (dictation: string): string[] =>
  dictation
    .trim()
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== '');

const evidenceQuestion = (
  result: CodeResult,
  sentences: readonly string[],
): EvidenceChoiceQuestion => ({
  criteria: Object.fromEntries(
    sentences.map((sentence, index) => [
      `sentence_${index}`,
      {
        what: `This exact sentence is the strongest evidence relevant to ${result.system} ${result.code}: “${sentence}”`,
      },
    ]),
  ),
  instructions: {
    candidate: {
      code: result.code,
      description: result.description,
      system: result.system,
    },
    inspect: '`dictation`',
    question:
      'Which supplied sentence is the strongest evidence for the coding decision? Select only an exact supplied sentence.',
  },
  type: 'choice',
});

const reviewQuestion = (result: CodeResult): EvidenceChoiceQuestion => ({
  criteria: Object.fromEntries(
    Object.entries(REVIEW_ACTIONS).map(([category, action]) => [
      category,
      { what: action },
    ]),
  ),
  instructions: {
    candidate: {
      code: result.code,
      description: result.description,
      system: result.system,
    },
    inspect: '`dictation`',
    question:
      'What is the primary documentation issue a coding reviewer must resolve for this candidate?',
  },
  type: 'choice',
});

const resultId = (index: number): string => `result_${index}`;
const reviewId = (index: number): string => `review_${index}`;

const buildEvidenceRequest = (
  dictation: string,
  results: readonly CodeResult[],
  model: string,
): ChoiceRequest => {
  const sentences = splitSentences(dictation);
  if (sentences.length === ZERO) {
    throw new Error('The dictation is empty.');
  }
  const questions: Record<string, EvidenceChoiceQuestion> = {};
  for (const [index, result] of results.entries()) {
    questions[resultId(index)] = evidenceQuestion(result, sentences);
    if (result.needsManualReview) {
      questions[reviewId(index)] = reviewQuestion(result);
    }
  }
  return { model, questions, state: { dictation } };
};

const requiredAnswer = (response: ChoiceResponse, id: string): ChoiceAnswer => {
  const answer = response.answers[id];
  if (answer === undefined) {
    throw new Error(`Jev returned no evidence answer for ${id}.`);
  }
  return answer;
};

const evidenceFor = (
  answer: ChoiceAnswer,
  sentences: readonly string[],
  id: string,
): Evidence => {
  const match = /^sentence_(?<index>\d+)$/u.exec(answer.choice);
  const index = Number(match?.groups?.['index']);
  const quote = sentences[index];
  if (match === null || !Number.isInteger(index) || quote === undefined) {
    throw new Error(`Jev returned invalid evidence for ${id}.`);
  }
  return { quote };
};

const isReviewCategory = (value: string): value is ReviewCategory => {
  switch (value) {
    case 'conflicting_documentation':
    case 'missing_anatomy':
    case 'missing_encounter_status':
    case 'missing_etiology':
    case 'missing_laterality':
    case 'missing_procedure_detail':
    case 'other_ambiguity':
    case 'separate_reporting': {
      return true;
    }
    default: {
      return false;
    }
  }
};

const reviewFor = (answer: ChoiceAnswer, id: string): ReviewAction => {
  if (!isReviewCategory(answer.choice)) {
    throw new Error(`Jev returned an invalid review reason for ${id}.`);
  }
  const category = answer.choice;
  return { action: REVIEW_ACTIONS[category], category };
};

const readEvidenceResults = (
  dictation: string,
  results: readonly CodeResult[],
  response: ChoiceResponse,
): EvidenceResult[] => {
  const sentences = splitSentences(dictation);
  return results.map((result, index) => {
    const id = resultId(index);
    const evidence = [evidenceFor(requiredAnswer(response, id), sentences, id)];
    if (!result.needsManualReview) {
      return { ...result, evidence };
    }
    const manualReviewId = reviewId(index);
    return {
      ...result,
      evidence,
      review: reviewFor(
        requiredAnswer(response, manualReviewId),
        manualReviewId,
      ),
    };
  });
};

export type { Evidence, EvidenceResult, ReviewAction };
export { buildEvidenceRequest, readEvidenceResults, REVIEW_ACTIONS };
