import assert from "node:assert/strict";
import test from "node:test";
import { buildJevRequest, parseCatalog } from "../src/codes.ts";
import { askJev } from "../src/typesafe.ts";

const request = buildJevRequest(
  "A procedure was performed.",
  parseCatalog([
    { code: "CODE-A", system: "TEST", description: "A procedure" },
  ]),
  "jev-latest",
);

test("askJev sends the documented raw HTTP request and parses its response", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const response = await askJev(request, {
    apiKey: "secret-for-test",
    endpoint: "https://example.test/v1/systemone",
    fetch: async (input, init) => {
      calls.push({ input: String(input), init });
      return Response.json({
        model: "jev-1.13.0",
        answers: {
          candidate_0: {
            type: "choice",
            choice: "supported",
            probabilities: { supported: 0.8, not_supported: 0.2 },
            confidence: 0.75,
          },
        },
        usage: { input_tokens: 100, output_tokens: 4 },
      });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, "https://example.test/v1/systemone");
  assert.equal(
    new Headers(calls[0].init?.headers).get("authorization"),
    "Bearer secret-for-test",
  );
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), request);
  assert.equal(response.answers.candidate_0.probabilities.supported, 0.8);
});

test("askJev surfaces authentication failures without retrying", async () => {
  let calls = 0;

  await assert.rejects(
    askJev(request, {
      apiKey: "bad-key",
      fetch: async () => {
        calls += 1;
        return new Response('{"detail":"invalid key"}', { status: 401 });
      },
    }),
    /HTTP 401.*invalid key/,
  );
  assert.equal(calls, 1);
});

test("askJev retries a 529 response", async () => {
  let calls = 0;
  const response = await askJev(request, {
    apiKey: "secret-for-test",
    maxAttempts: 2,
    fetch: async () => {
      calls += 1;
      if (calls === 1) {
        return new Response("overloaded", {
          status: 529,
          headers: { "retry-after": "0" },
        });
      }
      return Response.json({
        model: "jev-1.13.0",
        answers: {
          candidate_0: {
            type: "choice",
            choice: "supported",
            probabilities: { supported: 0.8, not_supported: 0.2 },
            confidence: 0.75,
          },
        },
        usage: { input_tokens: 100, output_tokens: 4 },
      });
    },
  });

  assert.equal(calls, 2);
  assert.equal(response.model, "jev-1.13.0");
});
