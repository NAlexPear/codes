export type BillingCode = {
  code: string;
  system: string;
  description: string;
  guidance?: string;
};

export type CodeResult = BillingCode & {
  likelihood: number;
  confidence: number;
  probabilities: {
    supported: number;
    not_supported: number;
  };
  needsManualReview: boolean;
};

type ChoiceQuestion = {
  type: "choice";
  instructions: {
    task: string;
    candidate: BillingCode;
    rules: string[];
  };
  criteria: {
    supported: string;
    not_supported: string;
  };
};

export type JevRequest = {
  state: { dictation: string };
  model: string;
  questions: Record<string, ChoiceQuestion>;
};

type ChoiceAnswer = {
  type: "choice";
  choice: "supported" | "not_supported";
  probabilities: Record<string, number>;
  confidence: number;
};

export type JevResponse = {
  model: string;
  answers: Record<string, ChoiceAnswer>;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
};

export function parseCatalog(value: unknown): BillingCode[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("The code catalog must be a non-empty JSON array.");
  }

  const seen = new Set<string>();
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Code catalog entry ${index} must be an object.`);
    }

    const code = requiredString(entry.code, `entry ${index} code`);
    const system = requiredString(entry.system, `entry ${index} system`);
    const description = requiredString(
      entry.description,
      `entry ${index} description`,
    );
    const guidance = optionalString(entry.guidance, `entry ${index} guidance`);
    const identity = `${system.toLowerCase()}\u0000${code.toLowerCase()}`;

    if (seen.has(identity)) {
      throw new Error(`Duplicate code catalog entry: ${system} ${code}.`);
    }
    seen.add(identity);

    return guidance === undefined
      ? { code, system, description }
      : { code, system, description, guidance };
  });
}

export function buildJevRequest(
  dictation: string,
  catalog: BillingCode[],
  model: string,
): JevRequest {
  if (dictation.trim() === "") {
    throw new Error("The dictation is empty.");
  }

  const questions = Object.fromEntries(
    catalog.map((candidate, index) => [
      questionId(index),
      {
        type: "choice" as const,
        instructions: {
          task: "Choose whether the dictation explicitly supports this billing code candidate.",
          candidate,
          rules: [
            "Judge only the candidate shown in this question.",
            "Require documentation of the diagnosis, service, or procedure represented by the candidate.",
            "Do not infer undocumented details such as laterality, approach, extent, or complications.",
            "A mention in history, a planned future service, or a ruled-out diagnosis is not support for coding the current encounter.",
          ],
        },
        criteria: {
          supported: "The current encounter explicitly documents the candidate with the specificity needed to support it.",
          not_supported: "The candidate is absent, historical, planned, ruled out, contradicted, or lacks required specificity.",
        },
      },
    ]),
  );

  return {
    state: { dictation },
    model,
    questions,
  };
}

export function readCodeResults(
  response: JevResponse,
  catalog: BillingCode[],
  likelihoodThreshold: number,
  confidenceThreshold: number,
): CodeResult[] {
  return catalog
    .map((candidate, index) => {
      const id = questionId(index);
      const answer = response.answers[id];
      const supported = answer?.probabilities?.supported;
      const notSupported = answer?.probabilities?.not_supported;
      if (
        answer?.type !== "choice" ||
        !["supported", "not_supported"].includes(answer.choice) ||
        !isProbability(supported) ||
        !isProbability(notSupported) ||
        !isProbability(answer.confidence) ||
        Math.abs(supported + notSupported - 1) > 0.001
      ) {
        throw new Error(`Jev returned an invalid answer for ${id}.`);
      }

      return {
        ...candidate,
        likelihood: supported,
        confidence: answer.confidence,
        probabilities: {
          supported,
          not_supported: notSupported,
        },
        needsManualReview: answer.confidence < confidenceThreshold,
      };
    })
    .filter(({ likelihood }) => likelihood >= likelihoodThreshold)
    .sort((left, right) => right.likelihood - left.likelihood);
}

function questionId(index: number): string {
  return `candidate_${index}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProbability(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Code catalog ${field} must be a non-empty string.`);
  }
  return value.trim();
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requiredString(value, field);
}
