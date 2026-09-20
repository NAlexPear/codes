import assert from 'node:assert/strict';
import test from 'node:test';

import { parseEvalOptions } from '../src/eval-options.ts';

await test('eval defaults to one Jev run', () => {
  assert.deepEqual(parseEvalOptions([]), {
    evidence: false,
    help: false,
    repetitions: 1,
    specs: [{ model: 'jev-latest', provider: 'jev' }],
  });
});

await test('eval pairs repeated providers and models', () => {
  assert.deepEqual(
    parseEvalOptions([
      '--provider',
      'jev',
      '--provider',
      'openai',
      '--model',
      'jev-1.13.0',
      '--model',
      'gpt-6-astra',
      '--repetitions',
      '3',
    ]),
    {
      evidence: false,
      help: false,
      repetitions: 3,
      specs: [
        { model: 'jev-1.13.0', provider: 'jev' },
        { model: 'gpt-6-astra', provider: 'openai' },
      ],
    },
  );
});

await test('eval enables the evidence benchmark explicitly', () => {
  assert.equal(parseEvalOptions(['--evidence']).evidence, true);
});

await test('eval rejects incomplete provider configuration', () => {
  assert.throws(
    () => parseEvalOptions(['--provider', 'openai']),
    /--model is required/u,
  );
  assert.throws(
    () =>
      parseEvalOptions([
        '--provider',
        'jev',
        '--provider',
        'openai',
        '--model',
        'jev-latest',
      ]),
    /exactly one --model/u,
  );
  assert.throws(
    () => parseEvalOptions(['--repetitions', '0']),
    /positive integer/u,
  );
});
