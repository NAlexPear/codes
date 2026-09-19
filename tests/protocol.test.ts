import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStreamEvent } from '../src/protocol.ts';

await test('parses each NDJSON stream event', () => {
  assert.deepEqual(
    parseStreamEvent('{"type":"start","sessionId":"case-123"}'),
    { sessionId: 'case-123', type: 'start' },
  );
  assert.deepEqual(
    parseStreamEvent(
      '{"type":"transcript","sequence":1,"segmentId":"s1","text":"Open release","final":false}',
    ),
    {
      final: false,
      segmentId: 's1',
      sequence: 1,
      text: 'Open release',
      type: 'transcript',
    },
  );
  assert.deepEqual(parseStreamEvent('{"type":"end","sequence":2}'), {
    sequence: 2,
    type: 'end',
  });
});

await test('rejects malformed stream events', () => {
  assert.throws(() => parseStreamEvent('not JSON'), /valid JSON/u);
  assert.throws(() => parseStreamEvent('[]'), /JSON object/u);
  assert.throws(
    () => parseStreamEvent('{"type":"transcript","sequence":-1}'),
    /string text and boolean final/u,
  );
  assert.throws(() => parseStreamEvent('{"type":"other"}'), /type must be/u);
});
