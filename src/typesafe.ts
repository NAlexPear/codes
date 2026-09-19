import { setTimeout as sleep } from 'node:timers/promises';

import type { JevRequest, JevResponse } from './codes.ts';

const ZERO = 0;
const FIRST_ATTEMPT = 1;
const DEFAULT_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRY_DELAY_MS = 30_000;
const MILLISECONDS_PER_SECOND = 1_000;
const BASE_RETRY_DELAY_MS = 500;
const BACKOFF_FACTOR = 2;
const ERROR_DETAIL_LIMIT = 1_000;
const RATE_LIMITED = 429;
const OVERLOADED = 529;
const DEFAULT_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const RETRYABLE_STATUSES = new Set([RATE_LIMITED, OVERLOADED]);

type Fetch = typeof fetch;

interface JevClientOptions {
  apiKey: string;
  endpoint?: string;
  fetch?: Fetch;
  maxAttempts?: number;
  timeoutMs?: number;
}

interface ResolvedOptions {
  apiKey: string;
  endpoint: string;
  fetch: Fetch;
  maxAttempts: number;
  timeoutMs: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isChoice = (
  value: unknown,
): value is 'needs_review' | 'not_supported' | 'supported' =>
  value === 'supported' ||
  value === 'needs_review' ||
  value === 'not_supported';

const isInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value);

const parseChoiceAnswer = (value: unknown): JevResponse['answers'][string] => {
  if (!isRecord(value) || !isRecord(value['probabilities'])) {
    throw new Error('TypeSafe API returned an invalid answer.');
  }
  const { choice, confidence } = value;
  const {
    needs_review: needsReview,
    not_supported: notSupported,
    supported,
  } = value['probabilities'];
  if (
    value['type'] !== 'choice' ||
    !isChoice(choice) ||
    typeof confidence !== 'number' ||
    typeof supported !== 'number' ||
    typeof needsReview !== 'number' ||
    typeof notSupported !== 'number'
  ) {
    throw new Error('TypeSafe API returned an invalid answer.');
  }
  return {
    choice,
    confidence,
    probabilities: {
      needs_review: needsReview,
      not_supported: notSupported,
      supported,
    },
    type: 'choice',
  };
};

const parseUsage = (value: unknown): JevResponse['usage'] => {
  if (!isRecord(value)) {
    throw new Error('TypeSafe API returned invalid usage data.');
  }
  const inputTokens = value['input_tokens'];
  const outputTokens = value['output_tokens'];
  if (!isInteger(inputTokens) || !isInteger(outputTokens)) {
    throw new TypeError('TypeSafe API returned invalid usage data.');
  }
  return { input_tokens: inputTokens, output_tokens: outputTokens };
};

const parseResponse = (value: unknown): JevResponse => {
  if (
    !isRecord(value) ||
    typeof value['model'] !== 'string' ||
    !isRecord(value['answers'])
  ) {
    throw new Error('TypeSafe API returned an invalid response.');
  }
  const answers = Object.fromEntries(
    Object.entries(value['answers']).map(([id, answer]) => [
      id,
      parseChoiceAnswer(answer),
    ]),
  );
  return { answers, model: value['model'], usage: parseUsage(value['usage']) };
};

const retryDelayMs = (retryAfter: string | null, attempt: number): number => {
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= ZERO) {
      return Math.min(seconds * MILLISECONDS_PER_SECOND, MAX_RETRY_DELAY_MS);
    }
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) {
      return Math.max(ZERO, Math.min(date - Date.now(), MAX_RETRY_DELAY_MS));
    }
  }
  return BASE_RETRY_DELAY_MS * BACKOFF_FACTOR ** (attempt - FIRST_ATTEMPT);
};

const resolveOptions = (options: JevClientOptions): ResolvedOptions => ({
  apiKey: options.apiKey,
  endpoint: options.endpoint ?? DEFAULT_ENDPOINT,
  fetch: options.fetch ?? globalThis.fetch,
  maxAttempts: options.maxAttempts ?? DEFAULT_ATTEMPTS,
  timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
});

const sendRequest = async (
  request: JevRequest,
  options: ResolvedOptions,
): Promise<Response> => {
  try {
    return await options.fetch(options.endpoint, {
      body: JSON.stringify(request),
      headers: {
        authorization: `Bearer ${options.apiKey}`,
        'content-type': 'application/json',
      },
      method: 'POST',
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (error) {
    throw new Error('Could not reach the TypeSafe API.', { cause: error });
  }
};

const apiError = async (response: Response): Promise<Error> => {
  const responseText = await response.text();
  const detail = responseText.slice(ZERO, ERROR_DETAIL_LIMIT).trim();
  let suffix = '';
  if (detail !== '') {
    suffix = `: ${detail}`;
  }
  return new Error(`TypeSafe API returned HTTP ${response.status}${suffix}`);
};

const askJev = async (
  request: JevRequest,
  clientOptions: JevClientOptions,
): Promise<JevResponse> => {
  if (clientOptions.apiKey === '') {
    throw new Error('TYPESAFE_API_KEY is required.');
  }
  const options = resolveOptions(clientOptions);
  for (
    let attempt = FIRST_ATTEMPT;
    attempt <= options.maxAttempts;
    attempt += FIRST_ATTEMPT
  ) {
    const response = await sendRequest(request, options);
    if (response.ok) {
      const value: unknown = await response.json();
      return parseResponse(value);
    }
    if (
      !RETRYABLE_STATUSES.has(response.status) ||
      attempt === options.maxAttempts
    ) {
      throw await apiError(response);
    }
    await sleep(retryDelayMs(response.headers.get('retry-after'), attempt));
  }
  throw new Error('TypeSafe API retry limit reached.');
};

export type { JevClientOptions };
export { askJev };
