import assert from 'node:assert/strict';
import test from 'node:test';

import type { ExtractionResult } from '../src/extractor.ts';
import type { StreamSnapshot } from '../src/stream.ts';

import { createInPlaceRenderer } from '../src/loader.ts';
import {
  formatBatchOutput,
  formatStreamOutput,
  formatStreamResult,
  formatTable,
  parseOutputMode,
} from '../src/output.ts';

const RESULT: ExtractionResult = {
  manualReview: [
    {
      code: 'G56.02',
      confidence: 0.6,
      description: 'Carpal tunnel syndrome, left upper limb',
      evidence: [{ quote: 'The diagnosis line says carpal tunnel syndrome.' }],
      likelihood: 0.75,
      needsManualReview: true,
      probabilities: {
        needs_review: 0.55,
        not_supported: 0.25,
        supported: 0.2,
      },
      review: {
        action: 'Confirm the affected side.',
        category: 'missing_laterality',
      },
      system: 'ICD-10-CM',
    },
  ],
  matches: [
    {
      code: '64721',
      confidence: 0.97,
      description: 'Open median nerve decompression at the carpal tunnel',
      evidence: [{ quote: 'The transverse carpal ligament was released.' }],
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
  const output = formatTable(RESULT, { columns: 100 });

  assert.match(output, /^┌/u);
  assert.match(output, /Status[\s\S]*Code[\s\S]*Likelihood/u);
  assert.match(output, /Match[\s\S]*CPT 64721[\s\S]*99%[\s\S]*97%/u);
  assert.match(output, /Review[\s\S]*G56\.02[\s\S]*75%[\s\S]*60%/u);
  assert.match(output, /Open median nerve[\s\S]*carpal tunnel/u);
  assert.match(output, /Evidence[\s\S]*transverse carpal ligament/u);
  assert.match(output, /Action[\s\S]*Confirm the affected side/u);
  assert.doesNotMatch(output, /…/u);
  assert.doesNotMatch(output, /Billing code suggestions|Model|tokens/u);
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

  assert.match(output, /^Final · revision 4 · session case-123/u);
  assert.match(output, /Ended by voice command for doctor Jane Smith/u);
  assert.match(output, /┌.*┬.*┐/u);
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

await test('adds colors only when requested', () => {
  const plain = formatTable(RESULT);
  const colored = formatTable(RESULT, { color: true });

  assert.equal(plain.includes('\u001B'), false);
  assert.equal(colored.includes('\u001B[32m'), true);
  assert.equal(colored.includes('\u001B[33m'), true);
  assert.equal(colored.includes('\u001B[36m'), true);
});

await test('repaints stream output in place and clears leftover lines', () => {
  const chunks: string[] = [];
  const render = createInPlaceRenderer((chunk) => {
    chunks.push(chunk);
  });

  render('first\nsecond');
  render('replacement');

  const output = chunks.join('');
  assert.equal(output.includes('\u001B[2F'), true);
  assert.equal(output.includes('\u001B[2Kreplacement\n'), true);
  assert.equal(output.endsWith('\u001B[2K\n\u001B[1F'), true);
});
