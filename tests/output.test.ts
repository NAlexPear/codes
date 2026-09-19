import assert from 'node:assert/strict';
import test from 'node:test';

import type { ExtractionResult } from '../src/extractor.ts';
import type { StreamSnapshot } from '../src/stream.ts';

import {
  formatBatchOutput,
  formatBatchResult,
  formatStreamOutput,
  formatStreamResult,
  parseOutputMode,
} from '../src/output.ts';

const RESULT: ExtractionResult = {
  manualReview: [
    {
      code: 'G56.02',
      confidence: 0.6,
      description: 'Carpal tunnel syndrome, left upper limb',
      likelihood: 0.75,
      needsManualReview: true,
      probabilities: {
        needs_review: 0.55,
        not_supported: 0.25,
        supported: 0.2,
      },
      system: 'ICD-10-CM',
    },
  ],
  matches: [
    {
      code: '64721',
      confidence: 0.97,
      description: 'Open median nerve decompression at the carpal tunnel',
      likelihood: 0.99,
      needsManualReview: false,
      probabilities: {
        needs_review: 0.02,
        not_supported: 0.01,
        supported: 0.97,
      },
      system: 'CPT',
    },
  ],
  model: 'jev-test',
  thresholds: { confidence: 0.8, likelihood: 0.5 },
  usage: { input_tokens: 100, output_tokens: 20 },
};

await test('formats batch results for a person', () => {
  const output = formatBatchResult(RESULT);

  assert.match(output, /^Billing code suggestions/u);
  assert.match(output, /Matches \(1\)[\s\S]*CPT 64721/u);
  assert.match(output, /likelihood 99% · confidence 97%/u);
  assert.match(output, /Manual review \(1\)[\s\S]*G56\.02/u);
  assert.match(output, /Model jev-test · tokens 100 in \/ 20 out$/u);
});

await test('formats final stream status and voice termination', () => {
  const snapshot: StreamSnapshot = {
    ...RESULT,
    final: true,
    revision: 4,
    sessionId: 'case-123',
    termination: { doctorName: 'Jane Smith', reason: 'voice-command' },
    type: 'codes',
  };

  const output = formatStreamResult(snapshot);

  assert.match(output, /^Final billing codes · revision 4 · session case-123/u);
  assert.match(output, /Ended by voice command for doctor Jane Smith/u);
});

await test('accepts only the documented output modes', () => {
  assert.equal(parseOutputMode('human'), 'human');
  assert.equal(parseOutputMode('json'), 'json');
  assert.throws(() => parseOutputMode('yaml'), /human or json/u);
});

await test('formats batch JSON with indentation and stream JSON as NDJSON records', () => {
  const snapshot: StreamSnapshot = {
    ...RESULT,
    final: false,
    revision: 1,
    sessionId: 'case-json',
    type: 'codes',
  };

  const batch = formatBatchOutput(RESULT, 'json');
  const stream = formatStreamOutput(snapshot, 'json');

  assert.match(batch, /^\{\n {2}"manualReview"/u);
  assert.doesNotMatch(stream, /\n/u);
  assert.deepEqual(JSON.parse(batch), RESULT);
  assert.deepEqual(JSON.parse(stream), snapshot);
});
