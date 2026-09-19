const ZERO = 0;

interface StartEvent {
  sessionId: string;
  type: 'start';
}

interface TranscriptEvent {
  final: boolean;
  segmentId: string;
  sequence: number;
  text: string;
  type: 'transcript';
}

interface EndEvent {
  sequence: number;
  type: 'end';
}

type StreamEvent = EndEvent | StartEvent | TranscriptEvent;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`Stream event ${field} must be a non-empty string.`);
  }
  return value.trim();
};

const sequence = (value: unknown): number => {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < ZERO
  ) {
    throw new TypeError(
      'Stream event sequence must be a non-negative integer.',
    );
  }
  return value;
};

const parseTranscript = (value: Record<string, unknown>): TranscriptEvent => {
  if (
    typeof value['final'] !== 'boolean' ||
    typeof value['text'] !== 'string'
  ) {
    throw new TypeError(
      'Transcript events require string text and boolean final.',
    );
  }
  return {
    final: value['final'],
    segmentId: requiredString(value['segmentId'], 'segmentId'),
    sequence: sequence(value['sequence']),
    text: value['text'],
    type: 'transcript',
  };
};

const parseJson = (line: string): unknown => {
  try {
    return JSON.parse(line) as unknown;
  } catch (error) {
    throw new Error('Each stream input line must be valid JSON.', {
      cause: error,
    });
  }
};

const parseStreamEvent = (line: string): StreamEvent => {
  const value = parseJson(line);
  if (!isRecord(value)) {
    throw new TypeError('Each stream event must be a JSON object.');
  }
  if (value['type'] === 'start') {
    return {
      sessionId: requiredString(value['sessionId'], 'sessionId'),
      type: 'start',
    };
  }
  if (value['type'] === 'transcript') {
    return parseTranscript(value);
  }
  if (value['type'] === 'end') {
    return { sequence: sequence(value['sequence']), type: 'end' };
  }
  throw new Error('Stream event type must be start, transcript, or end.');
};

export type { EndEvent, StartEvent, StreamEvent, TranscriptEvent };
export { parseStreamEvent };
