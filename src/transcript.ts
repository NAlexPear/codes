import type { TranscriptEvent } from './protocol.ts';

interface Segment {
  final: boolean;
  text: string;
}

interface VoiceTermination {
  doctorName: string;
  reason: 'voice-command';
}

const END_COMMAND = /^end dictation for doctor (?<doctorName>.+)$/iu;
const INITIAL_SEQUENCE = -1;
const ZERO = 0;

const voiceTermination = (
  event: TranscriptEvent,
): VoiceTermination | undefined => {
  if (!event.final) {
    return undefined;
  }
  const normalized = event.text
    .trim()
    .replace(/[.!?]+$/u, '')
    .replaceAll(/\s+/gu, ' ');
  const match = END_COMMAND.exec(normalized);
  const doctorName = match?.groups?.['doctorName']?.trim();
  if (doctorName === undefined || doctorName === '') {
    return undefined;
  }
  return { doctorName, reason: 'voice-command' };
};

class Transcript {
  readonly #segments = new Map<string, Segment>();
  #lastSequence = INITIAL_SEQUENCE;
  #revision = ZERO;

  public get revision(): number {
    return this.#revision;
  }

  public apply(event: TranscriptEvent): VoiceTermination | undefined {
    this.#acceptSequence(event.sequence);
    const termination = voiceTermination(event);
    if (termination !== undefined) {
      return termination;
    }
    const previous = this.#segments.get(event.segmentId);
    if (previous?.final === true) {
      throw new Error(
        `Final transcript segment ${event.segmentId} cannot be revised.`,
      );
    }
    this.#segments.set(event.segmentId, {
      final: event.final,
      text: event.text,
    });
    this.#revision += 1;
    return undefined;
  }

  public acceptEnd(sequence: number): void {
    this.#acceptSequence(sequence);
  }

  public text(): string {
    return [...this.#segments.values()]
      .map(({ text }) => text.trim())
      .filter((text) => text !== '')
      .join(' ');
  }

  #acceptSequence(sequence: number): void {
    if (sequence <= this.#lastSequence) {
      throw new Error('Stream event sequences must increase strictly.');
    }
    this.#lastSequence = sequence;
  }
}

export type { VoiceTermination };
export { Transcript, voiceTermination };
