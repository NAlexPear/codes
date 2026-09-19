import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { setTimeout } from 'node:timers/promises';

import type { ExtractionResult } from '../src/extractor.ts';
import type { TranscriptEvent } from '../src/protocol.ts';
import type { StreamSnapshot } from '../src/stream.ts';

import { runStream, StreamSession } from '../src/stream.ts';

const RESULT: ExtractionResult = {
  manualReview: [],
  matches: [],
  model: 'test-model',
  thresholds: { confidence: 0.8, likelihood: 0.5 },
  usage: { input_tokens: 1, output_tokens: 1 },
};

const event = (sequence: number, text: string): TranscriptEvent => ({
  final: false,
  segmentId: 's1',
  sequence,
  text,
  type: 'transcript',
});

const input = (lines: readonly string[]): AsyncIterable<string> =>
  Readable.from(lines);

await test('finalizes on the voice command without coding the command', async () => {
  const dictations: string[] = [];
  const snapshots: StreamSnapshot[] = [];
  await runStream(
    input([
      '{"type":"start","sessionId":"case-123"}',
      '{"type":"transcript","sequence":1,"segmentId":"s1","text":"Right carpal tunnel release","final":true}',
      '{"type":"transcript","sequence":2,"segmentId":"end","text":"end dictation for doctor Jane Smith.","final":true}',
    ]),
    {
      extract: (dictation) => {
        dictations.push(dictation);
        return Promise.resolve(RESULT);
      },
      output: (snapshot): void => {
        snapshots.push(snapshot);
      },
    },
  );

  assert.deepEqual(dictations, ['Right carpal tunnel release']);
  assert.equal(snapshots.length, 1);
  assert.deepEqual(snapshots[0], {
    ...RESULT,
    final: true,
    revision: 1,
    sessionId: 'case-123',
    termination: { doctorName: 'Jane Smith', reason: 'voice-command' },
    type: 'codes',
  });
});

await test('finalizes the latest segment revision on EOF', async () => {
  const dictations: string[] = [];
  const snapshots: StreamSnapshot[] = [];
  await runStream(
    input([
      '{"type":"transcript","sequence":1,"segmentId":"s1","text":"trigger","final":false}',
      '{"type":"transcript","sequence":2,"segmentId":"s1","text":"trigger finger release","final":true}',
    ]),
    {
      extract: (dictation) => {
        dictations.push(dictation);
        return Promise.resolve(RESULT);
      },
      output: (snapshot): void => {
        snapshots.push(snapshot);
      },
    },
  );

  assert.deepEqual(dictations, ['trigger finger release']);
  const [snapshot] = snapshots;
  assert.ok(snapshot);
  assert.equal(snapshot.termination?.reason, 'eof');
  assert.equal(snapshot.revision, 2);
});

await test('emits a provisional snapshot and reuses it when finalized', async () => {
  const dictations: string[] = [];
  const snapshots: StreamSnapshot[] = [];
  const session = new StreamSession({
    debounceMs: 0,
    extract: (dictation): Promise<ExtractionResult> => {
      dictations.push(dictation);
      return Promise.resolve(RESULT);
    },
    maxDelayMs: 0,
    output: (snapshot): void => {
      snapshots.push(snapshot);
    },
  });

  session.update(event(1, 'thumb arthroplasty'));
  await setTimeout(0);
  await session.finalize({ reason: 'end-event' });

  assert.deepEqual(dictations, ['thumb arthroplasty']);
  assert.deepEqual(
    snapshots.map(({ final, termination }) => ({ final, termination })),
    [
      { final: false, termination: undefined },
      { final: true, termination: { reason: 'end-event' } },
    ],
  );
});

await test('suppresses stale extraction results and flushes the latest revision', async () => {
  const first = Promise.withResolvers<ExtractionResult>();
  const dictations: string[] = [];
  const snapshots: StreamSnapshot[] = [];
  const session = new StreamSession({
    debounceMs: 0,
    extract: (dictation): Promise<ExtractionResult> => {
      dictations.push(dictation);
      if (dictations.length === 1) {
        return first.promise;
      }
      return Promise.resolve(RESULT);
    },
    maxDelayMs: 0,
    output: (snapshot): void => {
      snapshots.push(snapshot);
    },
  });

  session.update(event(1, 'carpal'));
  await setTimeout(0);
  session.update(event(2, 'carpal tunnel release'));
  first.resolve(RESULT);
  await session.finalize({ reason: 'eof' });

  assert.deepEqual(dictations, ['carpal', 'carpal tunnel release']);
  assert.deepEqual(
    snapshots.map(({ final, revision }) => ({ final, revision })),
    [{ final: true, revision: 2 }],
  );
});
