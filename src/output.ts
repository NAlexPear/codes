import type { CodeResult } from './codes.ts';
import type { ExtractionResult } from './extractor.ts';
import type { StreamSnapshot, Termination } from './stream.ts';

const ONE_HUNDRED = 100;
const ZERO = 0;
const JSON_INDENT = 2;

type OutputMode = 'human' | 'json';

const percentage = (value: number): string =>
  `${Math.round(value * ONE_HUNDRED)}%`;

const formatCode = (result: CodeResult): string =>
  [
    `  ${result.system} ${result.code} — ${result.description}`,
    `    likelihood ${percentage(result.likelihood)} · confidence ${percentage(result.confidence)}`,
  ].join('\n');

const formatSection = (
  title: string,
  results: readonly CodeResult[],
): string => {
  if (results.length === ZERO) {
    return `${title} (0)\n  None`;
  }
  return `${title} (${results.length})\n${results.map((result) => formatCode(result)).join('\n')}`;
};

const formatResult = (result: ExtractionResult): string =>
  [
    formatSection('Matches', result.matches),
    formatSection('Manual review', result.manualReview),
    `Model ${result.model} · tokens ${result.usage.input_tokens} in / ${result.usage.output_tokens} out`,
  ].join('\n\n');

const formatBatchResult = (result: ExtractionResult): string =>
  `Billing code suggestions\n\n${formatResult(result)}`;

const terminationLabel = (termination: Termination): string => {
  if (termination.reason === 'voice-command') {
    return `voice command for doctor ${termination.doctorName}`;
  }
  if (termination.reason === 'end-event') {
    return 'end event';
  }
  return 'end of input';
};

const formatStreamResult = (snapshot: StreamSnapshot): string => {
  let status = 'Provisional';
  if (snapshot.final) {
    status = 'Final';
  }
  const lines = [
    `${status} billing codes · revision ${snapshot.revision} · session ${snapshot.sessionId}`,
  ];
  if (snapshot.termination !== undefined) {
    lines.push(`Ended by ${terminationLabel(snapshot.termination)}`);
  }
  lines.push('', formatResult(snapshot));
  return lines.join('\n');
};

const formatBatchOutput = (
  result: ExtractionResult,
  mode: OutputMode,
): string => {
  if (mode === 'json') {
    return JSON.stringify(result, undefined, JSON_INDENT);
  }
  return formatBatchResult(result);
};

const formatStreamOutput = (
  snapshot: StreamSnapshot,
  mode: OutputMode,
): string => {
  if (mode === 'json') {
    return JSON.stringify(snapshot);
  }
  return formatStreamResult(snapshot);
};

const parseOutputMode = (value: string): OutputMode => {
  if (value === 'human' || value === 'json') {
    return value;
  }
  throw new Error('--output must be human or json.');
};

export type { OutputMode };
export {
  formatBatchOutput,
  formatBatchResult,
  formatStreamOutput,
  formatStreamResult,
  parseOutputMode,
};
