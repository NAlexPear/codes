import assert from 'node:assert/strict';
import test from 'node:test';

import { parseCatalog } from '../src/codes.ts';
import { decisionsFromOpenAI } from '../src/eval-providers.ts';
import { askOpenAI, buildOpenAIRequest } from '../src/openai.ts';
import { buildQuestions } from '../src/questions.ts';

const catalog = parseCatalog([
  { code: 'CODE-A', description: 'A documented service', system: 'CPT' },
  {
    code: 'CODE-B',
    description: 'An ambiguous diagnosis',
    system: 'ICD-10-CM',
  },
]);
const request = buildOpenAIRequest(
  'A service was performed, but the diagnosis is ambiguous.',
  catalog,
  'openai-test-model',
);

const successfulResponse = (): Response =>
  Response.json({
    model: 'openai-resolved-model',
    output: [
      {
        content: [
          {
            text: JSON.stringify({
              candidate_0: 'supported',
              candidate_1: 'needs_review',
            }),
            type: 'output_text',
          },
        ],
        type: 'message',
      },
    ],
    status: 'completed',
    usage: { input_tokens: 120, output_tokens: 20, total_tokens: 140 },
  });

const inputUrl = (input: Parameters<typeof fetch>[0]): string => {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
};

await test('buildOpenAIRequest preserves the Jev questions and requires every choice', () => {
  assert.equal(request.input.length, 2);
  const [, userInput] = request.input;
  assert.ok(userInput);
  const payload: unknown = JSON.parse(userInput.content);
  assert.deepEqual(payload, {
    dictation: 'A service was performed, but the diagnosis is ambiguous.',
    questions: buildQuestions(catalog),
  });
  assert.deepEqual(request.text.format.schema['required'], [
    'candidate_0',
    'candidate_1',
  ]);
  assert.deepEqual(request.text.format.schema['additionalProperties'], false);
});

await test('askOpenAI sends a strict Responses API request and parses choices', async () => {
  const calls: { init: RequestInit | undefined; input: string }[] = [];
  const result = await askOpenAI(request, {
    apiKey: 'secret-for-test',
    endpoint: 'https://example.test/v1/responses',
    fetch: (input, init) => {
      calls.push({ init, input: inputUrl(input) });
      return Promise.resolve(successfulResponse());
    },
  });

  const [call] = calls;
  assert.ok(call);
  assert.equal(call.input, 'https://example.test/v1/responses');
  assert.equal(
    new Headers(call.init?.headers).get('authorization'),
    'Bearer secret-for-test',
  );
  const body = call.init?.body;
  if (typeof body !== 'string') {
    assert.fail('Expected a string request body.');
  }
  assert.deepEqual(JSON.parse(body), request);
  assert.deepEqual(result, {
    choices: { candidate_0: 'supported', candidate_1: 'needs_review' },
    model: 'openai-resolved-model',
    usage: { inputTokens: 120, outputTokens: 20 },
  });
});

await test('OpenAI choices normalize to provider-neutral dispositions', () => {
  assert.deepEqual(
    decisionsFromOpenAI(
      { candidate_0: 'supported', candidate_1: 'needs_review' },
      catalog,
    ).map(({ code, disposition }) => ({ code, disposition })),
    [
      { code: 'CODE-A', disposition: 'automatic' },
      { code: 'CODE-B', disposition: 'manualReview' },
    ],
  );
});

await test('askOpenAI rejects incomplete candidate decisions', async () => {
  await assert.rejects(
    askOpenAI(request, {
      apiKey: 'secret-for-test',
      fetch: () =>
        Promise.resolve(
          Response.json({
            model: 'openai-resolved-model',
            output: [
              {
                content: [
                  { text: '{"candidate_0":"supported"}', type: 'output_text' },
                ],
                type: 'message',
              },
            ],
            status: 'completed',
            usage: { input_tokens: 10, output_tokens: 2 },
          }),
        ),
    }),
    /invalid billing-code decisions/u,
  );
});
