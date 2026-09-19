import type { WriteStream } from 'node:tty';

const FRAME_INTERVAL_MS = 80;
const ZERO = 0;
const ONE = 1;
const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;
const CLEAR_LINE = '\r\u001B[2K';
const ERASE_LINE = '\u001B[2K';

interface Loader {
  start: () => void;
  stop: () => void;
}

const createLoader = (
  stream: WriteStream,
  message: string,
  enabled: boolean,
): Loader => {
  let frame = ZERO;
  const state: { timer?: NodeJS.Timeout } = {};
  const render = (): void => {
    stream.write(`${CLEAR_LINE}${FRAMES[frame]} ${message}`);
    frame = (frame + ONE) % FRAMES.length;
  };
  const start = (): void => {
    if (!enabled || state.timer !== undefined) {
      return;
    }
    render();
    state.timer = setInterval(render, FRAME_INTERVAL_MS);
    state.timer.unref();
  };
  const stop = (): void => {
    if (state.timer === undefined) {
      return;
    }
    clearInterval(state.timer);
    delete state.timer;
    stream.write(CLEAR_LINE);
  };
  return { start, stop };
};

const createInPlaceRenderer = (
  write: (output: string) => void,
): ((output: string) => void) => {
  let previousLines = ZERO;
  return (output): void => {
    const lines = output.split('\n');
    const totalLines = Math.max(previousLines, lines.length);
    if (previousLines > ZERO) {
      write(`\u001B[${previousLines}F`);
    }
    for (let index = ZERO; index < totalLines; index += ONE) {
      write(`${ERASE_LINE}${lines[index] ?? ''}\n`);
    }
    if (totalLines > lines.length) {
      write(`\u001B[${totalLines - lines.length}F`);
    }
    previousLines = lines.length;
  };
};

export type { Loader };
export { createInPlaceRenderer, createLoader };
