import assert from "node:assert/strict";
import test from "node:test";
import {
  buildJevRequest,
  parseCatalog,
  readCodeResults,
  type JevResponse,
} from "../src/codes.ts";

const catalog = parseCatalog([
  {
    code: "CODE-A",
    system: "TEST",
    description: "A documented current procedure",
  },
  {
    code: "CODE-B",
    system: "TEST",
    description: "A different current procedure",
    guidance: "Requires explicit laterality",
  },
]);

test("buildJevRequest creates independent binary Choice questions for all candidates", () => {
  const request = buildJevRequest("Procedure A was performed.", catalog, "jev-latest");

  assert.deepEqual(request.state, { dictation: "Procedure A was performed." });
  assert.equal(request.questions.candidate_0.type, "choice");
  assert.equal(
    request.questions.candidate_1.instructions.candidate.guidance,
    "Requires explicit laterality",
  );
  assert.match(
    request.questions.candidate_0.criteria.not_supported,
    /historical, planned, ruled out/,
  );
});

test("readCodeResults keeps likely codes, flags low confidence, and sorts", () => {
  const response: JevResponse = {
    model: "jev-1.13.0",
    answers: {
      candidate_0: {
        type: "choice",
        choice: "supported",
        probabilities: { supported: 0.5, not_supported: 0.5 },
        confidence: 0.4,
      },
      candidate_1: {
        type: "choice",
        choice: "supported",
        probabilities: { supported: 0.91, not_supported: 0.09 },
        confidence: 0.9,
      },
    },
    usage: { input_tokens: 10, output_tokens: 2 },
  };

  assert.deepEqual(
    readCodeResults(response, catalog, 0.5, 0.8).map(
      ({ code, likelihood, needsManualReview }) => ({
        code,
        likelihood,
        needsManualReview,
      }),
    ),
    [
      { code: "CODE-B", likelihood: 0.91, needsManualReview: false },
      { code: "CODE-A", likelihood: 0.5, needsManualReview: true },
    ],
  );
});

test("parseCatalog rejects duplicate system and code identities", () => {
  assert.throws(
    () =>
      parseCatalog([
        { code: "123", system: "CPT", description: "First" },
        { code: "123", system: "cpt", description: "Second" },
      ]),
    /Duplicate code catalog entry: cpt 123/,
  );
});

test("readCodeResults rejects missing or out-of-range answers", () => {
  const response: JevResponse = {
    model: "jev-1.13.0",
    answers: {
      candidate_0: {
        type: "choice",
        choice: "supported",
        probabilities: { supported: 1.1, not_supported: 0 },
        confidence: 1,
      },
    },
    usage: { input_tokens: 10, output_tokens: 2 },
  };

  assert.throws(() => readCodeResults(response, catalog, 0.5, 0.8), /candidate_0/);
});
