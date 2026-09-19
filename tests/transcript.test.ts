import assert from 'node:assert/strict';
import test from 'node:test';

import type { TranscriptEvent } from '../src/protocol.ts';

import { Transcript, voiceTermination } from '../src/transcript.ts';

const event = (
  sequence: number,
  text: string,
  final = false,
): TranscriptEvent => ({
  final,
  segmentId: 's1',
  sequence,
  text,
  type: 'transcript',
});

await test('replaces interim segments and locks final segments', () => {
  const transcript = new Transcript();
  transcript.apply(event(1, 'carpal'));
  transcript.apply(event(2, 'carpal tunnel release', true));
  transcript.apply({ ...event(3, 'right hand', true), segmentId: 's2' });

  assert.equal(transcript.text(), 'carpal tunnel release right hand');
  assert.equal(transcript.revision, 3);
  assert.throws(
    () => transcript.apply(event(4, 'revised')),
    /cannot be revised/u,
  );
});

await test('requires strictly increasing event sequences', () => {
  const transcript = new Transcript();
  transcript.apply(event(2, 'first'));
  assert.throws(
    () => transcript.apply(event(2, 'second')),
    /increase strictly/u,
  );
});

await test('recognizes only a standalone finalized voice command', () => {
  assert.deepEqual(
    voiceTermination(
      event(1, ' End   dictation for doctor Jane Smith. ', true),
    ),
    { doctorName: 'Jane Smith', reason: 'voice-command' },
  );
  assert.equal(
    voiceTermination(event(1, 'end dictation for doctor Smith')),
    undefined,
  );
  assert.equal(
    voiceTermination(
      event(1, 'Patient said end dictation for doctor Smith', true),
    ),
    undefined,
  );
});

await test('excludes the voice command from clinical transcript text', () => {
  const transcript = new Transcript();
  transcript.apply(event(1, 'Trigger finger release.', true));
  const termination = transcript.apply(
    event(2, 'end dictation for doctor Lee', true),
  );

  assert.deepEqual(termination, { doctorName: 'Lee', reason: 'voice-command' });
  assert.equal(transcript.text(), 'Trigger finger release.');
  assert.equal(transcript.revision, 1);
});
