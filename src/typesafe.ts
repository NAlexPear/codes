import type { JevRequest, JevResponse } from "./codes.ts";

const DEFAULT_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const RETRYABLE_STATUSES = new Set([429, 529]);

type Fetch = typeof fetch;

export type JevClientOptions = {
  apiKey: string;
  endpoint?: string;
  fetch?: Fetch;
  maxAttempts?: number;
  timeoutMs?: number;
};

export async function askJev(
  request: JevRequest,
  options: JevClientOptions,
): Promise<JevResponse> {
  if (options.apiKey === "") {
    throw new Error("TYPESAFE_API_KEY is required.");
  }

  const requestFetch = options.fetch ?? globalThis.fetch;
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const maxAttempts = options.maxAttempts ?? 3;
  const timeoutMs = options.timeoutMs ?? 30_000;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await requestFetch(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new Error("Could not reach the TypeSafe API.", { cause: error });
    }

    if (response.ok) {
      return parseResponse(await response.json());
    }

    if (RETRYABLE_STATUSES.has(response.status) && attempt < maxAttempts) {
      await sleep(retryDelayMs(response.headers.get("retry-after"), attempt));
      continue;
    }

    const detail = (await response.text()).slice(0, 1_000).trim();
    const suffix = detail === "" ? "" : `: ${detail}`;
    throw new Error(`TypeSafe API returned HTTP ${response.status}${suffix}`);
  }

  throw new Error("TypeSafe API retry limit reached.");
}

function parseResponse(value: unknown): JevResponse {
  if (!isRecord(value) || typeof value.model !== "string") {
    throw new Error("TypeSafe API returned an invalid response.");
  }
  if (!isRecord(value.answers) || !isRecord(value.usage)) {
    throw new Error("TypeSafe API returned an invalid response.");
  }
  if (
    !Number.isInteger(value.usage.input_tokens) ||
    !Number.isInteger(value.usage.output_tokens)
  ) {
    throw new Error("TypeSafe API returned invalid usage data.");
  }

  return value as JevResponse;
}

function retryDelayMs(retryAfter: string | null, attempt: number): number {
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1_000, 30_000);
    }

    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) {
      return Math.max(0, Math.min(date - Date.now(), 30_000));
    }
  }
  return 500 * 2 ** (attempt - 1);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
