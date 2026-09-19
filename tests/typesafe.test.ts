import assert from 'node:assert/strict';
import test from 'node:test';

import { buildJevRequest, parseCatalog } from '../src/codes.ts';
import { askJev } from '../src/typesafe.ts';

const SUCCESS_PROBABILITY = 0.8;
const request = buildJevRequest(
  'A procedure was performed.',
  parseCatalog([
    { code: 'CODE-A', description: 'A procedure', system: 'TEST' },
  ]),
  'jev-latest',
);

const successfulResponse = (): Response =>
  Response.json({
    answers: {
      candidate_0: {
        choice: 'supported',
        confidence: 0.75,
        probabilities: {
          needs_review: 0,
          not_supported: 0.2,
          supported: SUCCESS_PROBABILITY,
        },
        type: 'choice',
      },
    },
    model: 'jev-1.13.0',
    usage: { input_tokens: 100, output_tokens: 4 },
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

await test('askJev sends the documented raw HTTP request and parses its response', async () => {
  const calls: { init: RequestInit | undefined; input: string }[] = [];
  const response = await askJev(request, {
    apiKey: 'secret-for-test',
    endpoint: 'https://example.test/v1/systemone',
    fetch: (input, init) => {
      calls.push({ init, input: inputUrl(input) });
      return Promise.resolve(successfulResponse());
    },
  });

  const [call] = calls;
  const answer = response.answers['candidate_0'];
  assert.ok(call);
  assert.ok(answer);
  assert.equal(call.input, 'https://example.test/v1/systemone');
  assert.equal(
    new Headers(call.init?.headers).get('authorization'),
    'Bearer secret-for-test',
  );
  const body = call.init?.body;
  if (typeof body !== 'string') {
    assert.fail('Expected a string request body.');
  }
  assert.deepEqual(JSON.parse(body), request);
  assert.equal(answer.probabilities['supported'], SUCCESS_PROBABILITY);
});

await test('askJev surfaces authentication failures without retrying', async () => {
  let calls = 0;

  await assert.rejects(
    askJev(request, {
      apiKey: 'bad-key',
      fetch: () => {
        calls += 1;
        return Promise.resolve(
          new Response('{"detail":"invalid key"}', { status: 401 }),
        );
      },
    }),
    /HTTP 401.*invalid key/u,
  );
  assert.equal(calls, 1);
});

await test('askJev retries a 529 response', async () => {
  let calls = 0;
  const response = await askJev(request, {
    apiKey: 'secret-for-test',
    fetch: () => {
      calls += 1;
      if (calls === 1) {
        return Promise.resolve(
          new Response('overloaded', {
            headers: { 'retry-after': '0' },
            status: 529,
          }),
        );
      }
      return Promise.resolve(successfulResponse());
    },
    maxAttempts: 2,
  });

  assert.equal(calls, 2);
  assert.equal(response.model, 'jev-1.13.0');
});
