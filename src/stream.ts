import type { Extract, ExtractionResult } from './extractor.ts';
import type { StartEvent, TranscriptEvent } from './protocol.ts';
import type { VoiceTermination } from './transcript.ts';

import { parseStreamEvent } from './protocol.ts';
import { Transcript } from './transcript.ts';

const DEFAULT_DEBOUNCE_MS = 750;
const DEFAULT_MAX_DELAY_MS = 2_500;
const ZERO = 0;

type Termination = VoiceTermination | { reason: 'end-event' | 'eof' };

interface StreamSnapshot extends ExtractionResult {
  final: boolean;
  revision: number;
  sessionId: string;
  termination?: Termination;
  type: 'codes';
}

interface StreamSessionOptions {
  debounceMs?: number;
  extract: Extract;
  maxDelayMs?: number;
  output: (snapshot: StreamSnapshot) => void;
}

interface StoredResult {
  result: ExtractionResult;
  revision: number;
}

class StreamSession {
  readonly #debounceMs: number;
  readonly #extract: Extract;
  readonly #maxDelayMs: number;
  readonly #output: (snapshot: StreamSnapshot) => void;
  readonly #transcript = new Transcript();
  #active: Promise<void> | undefined;
  #dirtySince: number | undefined;
  #failure: Error | undefined;
  #finishing = false;
  #result: StoredResult | undefined;
  #sessionId = 'default';
  #started = false;
  #timer: NodeJS.Timeout | undefined;

  public constructor(options: StreamSessionOptions) {
    this.#debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.#extract = options.extract;
    this.#maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
    this.#output = options.output;
  }

  public start(event: StartEvent): void {
    this.#throwFailure();
    if (this.#started || this.#transcript.revision !== ZERO) {
      throw new Error(
        'The start event must appear once, before transcript events.',
      );
    }
    this.#started = true;
    this.#sessionId = event.sessionId;
  }

  public update(event: TranscriptEvent): VoiceTermination | undefined {
    this.#throwFailure();
    const termination = this.#transcript.apply(event);
    if (termination === undefined) {
      this.#markDirty();
    }
    return termination;
  }

  public acceptEnd(sequence: number): void {
    this.#throwFailure();
    this.#transcript.acceptEnd(sequence);
  }

  public async finalize(termination: Termination): Promise<void> {
    this.#finishing = true;
    this.#clearTimer();
    await this.#active;
    this.#clearTimer();
    this.#throwFailure();
    if (this.#transcript.text() === '') {
      throw new Error('Cannot extract codes from an empty streamed dictation.');
    }
    if (this.#result?.revision !== this.#transcript.revision) {
      await this.#extractCurrent(false);
    }
    this.#emit(true, termination);
  }

  #markDirty(): void {
    const now = Date.now();
    this.#dirtySince ??= now;
    if (this.#active !== undefined) {
      return;
    }
    this.#clearTimer();
    const debounceAt = now + this.#debounceMs;
    const maximumAt = this.#dirtySince + this.#maxDelayMs;
    this.#timer = setTimeout(
      () => {
        this.#timer = undefined;
        this.#launchExtraction();
      },
      Math.max(ZERO, Math.min(debounceAt, maximumAt) - now),
    );
  }

  #launchExtraction(): void {
    this.#active = this.#runExtraction();
  }

  async #runExtraction(): Promise<void> {
    try {
      await this.#extractCurrent(true);
    } catch (error: unknown) {
      this.#failure = new Error(String(error), { cause: error });
    } finally {
      this.#active = undefined;
      this.#scheduleDirty();
    }
  }

  #scheduleDirty(): void {
    if (this.#dirtySince === undefined || this.#finishing) {
      return;
    }
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      this.#launchExtraction();
    }, ZERO);
  }

  async #extractCurrent(emit: boolean): Promise<void> {
    const { revision } = this.#transcript;
    const text = this.#transcript.text();
    this.#dirtySince = undefined;
    if (text === '') {
      return;
    }
    const result = await this.#extract(text);
    if (revision !== this.#transcript.revision) {
      return;
    }
    this.#result = { result, revision };
    if (emit) {
      this.#emit(false);
    }
  }

  #emit(final: boolean, termination?: Termination): void {
    if (this.#result === undefined) {
      throw new Error('No extraction result is available.');
    }
    const base = {
      ...this.#result.result,
      final,
      revision: this.#result.revision,
      sessionId: this.#sessionId,
      type: 'codes' as const,
    };
    if (termination === undefined) {
      this.#output(base);
      return;
    }
    this.#output({ ...base, termination });
  }

  #clearTimer(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  #throwFailure(): void {
    if (this.#failure !== undefined) {
      throw this.#failure;
    }
  }
}

const handleLine = async (
  session: StreamSession,
  line: string,
): Promise<boolean> => {
  const event = parseStreamEvent(line);
  if (event.type === 'start') {
    session.start(event);
    return false;
  }
  if (event.type === 'end') {
    session.acceptEnd(event.sequence);
    await session.finalize({ reason: 'end-event' });
    return true;
  }
  const termination = session.update(event);
  if (termination === undefined) {
    return false;
  }
  await session.finalize(termination);
  return true;
};

const runStream = async (
  lines: AsyncIterable<string>,
  options: StreamSessionOptions,
): Promise<void> => {
  const session = new StreamSession(options);
  for await (const line of lines) {
    if (line.trim() !== '' && (await handleLine(session, line))) {
      return;
    }
  }
  await session.finalize({ reason: 'eof' });
};

export type { StreamSessionOptions, StreamSnapshot, Termination };
export { runStream, StreamSession };
