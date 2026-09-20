import type { CodeResult } from './codes.ts';
import type { ExtractionResult } from './extractor.ts';
import type { StreamSnapshot, Termination } from './stream.ts';

import { detailLinesFor } from './output-details.ts';
import { truncate, wrapText } from './text.ts';

const ONE_HUNDRED = 100;
const ZERO = 0;
const ONE = 1;
const TWO = 2;
const JSON_INDENT = 2;
const DEFAULT_COLUMNS = 100;
const MIN_DESCRIPTION_WIDTH = 18;
const MAX_DESCRIPTION_WIDTH = 54;
const FIXED_TABLE_WIDTH = 59;
const STATUS_WIDTH = 6;
const CODE_WIDTH = 17;
const LIKELIHOOD_WIDTH = 10;
const CONFIDENCE_WIDTH = 10;
const RESET = '\u001B[0m';
const BOLD_CYAN = '\u001B[1;36m';
const CYAN = '\u001B[36m';
const GREEN = '\u001B[32m';
const YELLOW = '\u001B[33m';
const DIM = '\u001B[90m';

type OutputMode = 'human' | 'json';

interface TableOptions {
  color?: boolean;
  columns?: number;
}

interface Cell {
  align?: 'left' | 'right';
  color?: string | undefined;
  text: string;
  width: number;
}

const percentage = (value: number): string =>
  `${Math.round(value * ONE_HUNDRED)}%`;

const formatCell = (cell: Cell, color: boolean): string => {
  const value = truncate(cell.text, cell.width);
  let padded = value.padEnd(cell.width);
  if (cell.align === 'right') {
    padded = value.padStart(cell.width);
  }
  if (!color || cell.color === undefined) {
    return padded;
  }
  return `${cell.color}${padded}${RESET}`;
};

const border = (
  edges: readonly [string, string, string],
  widths: readonly number[],
): string => {
  const [left, middle, right] = edges;
  return `${left}${widths.map((width) => '─'.repeat(width + TWO)).join(middle)}${right}`;
};

const row = (cells: readonly Cell[], color: boolean): string =>
  `│${cells.map((cell) => ` ${formatCell(cell, color)} `).join('│')}│`;

const resultCells = (
  result: CodeResult,
  status: 'Match' | 'Review',
  descriptionWidth: number,
): Cell[] => {
  let statusColor = YELLOW;
  if (status === 'Match') {
    statusColor = GREEN;
  }
  return [
    { color: statusColor, text: status, width: STATUS_WIDTH },
    { color: CYAN, text: `${result.system} ${result.code}`, width: CODE_WIDTH },
    { text: result.description, width: descriptionWidth },
    {
      align: 'right',
      color: statusColor,
      text: percentage(result.likelihood),
      width: LIKELIHOOD_WIDTH,
    },
    {
      align: 'right',
      color: statusColor,
      text: percentage(result.confidence),
      width: CONFIDENCE_WIDTH,
    },
  ];
};

const headerCells = (descriptionWidth: number): Cell[] => [
  { text: 'Status', width: STATUS_WIDTH },
  { text: 'Code', width: CODE_WIDTH },
  { text: 'Description', width: descriptionWidth },
  { align: 'right', text: 'Likelihood', width: LIKELIHOOD_WIDTH },
  { align: 'right', text: 'Confidence', width: CONFIDENCE_WIDTH },
];

const continuationCells = (
  description: string,
  descriptionWidth: number,
  options: { color?: string; label?: string } = {},
): Cell[] => [
  { text: '', width: STATUS_WIDTH },
  { color: options.color, text: options.label ?? '', width: CODE_WIDTH },
  { color: options.color, text: description, width: descriptionWidth },
  { text: '', width: LIKELIHOOD_WIDTH },
  { text: '', width: CONFIDENCE_WIDTH },
];

const resultCellRows = (
  result: CodeResult,
  status: 'Match' | 'Review',
  descriptionWidth: number,
): Cell[][] => {
  const rows = wrapText(result.description, descriptionWidth).map(
    (description, index) => {
      if (index !== ZERO) {
        return continuationCells(description, descriptionWidth);
      }
      return resultCells({ ...result, description }, status, descriptionWidth);
    },
  );
  for (const detail of detailLinesFor(result, descriptionWidth)) {
    let color = DIM;
    if (detail.style === 'warning') {
      color = YELLOW;
    }
    rows.push(
      continuationCells(detail.text, descriptionWidth, {
        color,
        label: detail.label,
      }),
    );
  }
  return rows;
};

const tableRows = (
  result: ExtractionResult,
  descriptionWidth: number,
): Cell[][] => [
  ...result.matches.flatMap((code) =>
    resultCellRows(code, 'Match', descriptionWidth),
  ),
  ...result.manualReview.flatMap((code) =>
    resultCellRows(code, 'Review', descriptionWidth),
  ),
];

const colorizeLine = (line: string, style: string, color: boolean): string => {
  if (color) {
    return `${style}${line}${RESET}`;
  }
  return line;
};

const emptyRow = (descriptionWidth: number): Cell[] => [
  { text: 'None', width: STATUS_WIDTH },
  { text: '—', width: CODE_WIDTH },
  { text: 'No matching codes.', width: descriptionWidth },
  { align: 'right', text: '—', width: LIKELIHOOD_WIDTH },
  { align: 'right', text: '—', width: CONFIDENCE_WIDTH },
];

const formatTable = (
  result: ExtractionResult,
  options: TableOptions = {},
): string => {
  const color = options.color ?? false;
  const columns = options.columns ?? DEFAULT_COLUMNS;
  const descriptionWidth = Math.max(
    MIN_DESCRIPTION_WIDTH,
    Math.min(MAX_DESCRIPTION_WIDTH, columns - FIXED_TABLE_WIDTH),
  );
  const header = headerCells(descriptionWidth);
  const widths = header.map(({ width }) => width);
  const rows = tableRows(result, descriptionWidth);
  const lines = [
    border(['┌', '┬', '┐'], widths),
    colorizeLine(row(header, false), BOLD_CYAN, color),
    border(['├', '┼', '┤'], widths),
  ];
  if (rows.length === ZERO) {
    lines.push(row(emptyRow(descriptionWidth), false));
  } else {
    lines.push(...rows.map((cells) => row(cells, color)));
  }
  lines.push(border(['└', '┴', '┘'], widths));
  if (!color) {
    return lines.join('\n');
  }
  const styled = lines.map((line, index) => {
    if (index === ONE) {
      return line;
    }
    return colorizeLine(line, DIM, true);
  });
  return styled.join('\n');
};

const terminationLabel = (termination: Termination): string => {
  if (termination.reason === 'voice-command') {
    return `voice command for doctor ${termination.doctorName}`;
  }
  if (termination.reason === 'end-event') {
    return 'end event';
  }
  return 'end of input';
};

const formatStreamResult = (
  snapshot: StreamSnapshot,
  options: TableOptions = {},
): string => {
  const color = options.color ?? false;
  let status = 'Provisional';
  let statusColor = YELLOW;
  if (snapshot.final) {
    status = 'Final';
    statusColor = GREEN;
  }
  const lines = [
    colorizeLine(
      `${status} · revision ${snapshot.revision} · session ${snapshot.sessionId}`,
      statusColor,
      color,
    ),
  ];
  if (snapshot.termination !== undefined) {
    lines.push(`Ended by ${terminationLabel(snapshot.termination)}`);
  }
  lines.push(formatTable(snapshot, options));
  return lines.join('\n');
};

const formatBatchOutput = (
  result: ExtractionResult,
  mode: OutputMode,
  options?: TableOptions,
): string => {
  if (mode === 'json') {
    return JSON.stringify(result, undefined, JSON_INDENT);
  }
  return formatTable(result, options);
};

const formatStreamOutput = (
  snapshot: StreamSnapshot,
  mode: OutputMode,
  options?: TableOptions,
): string => {
  if (mode === 'json') {
    return JSON.stringify(snapshot);
  }
  return formatStreamResult(snapshot, options);
};

const parseOutputMode = (value: string): OutputMode => {
  if (value === 'human' || value === 'json') {
    return value;
  }
  throw new Error('--output must be human or json.');
};

export type { OutputMode, TableOptions };
export {
  formatBatchOutput,
  formatStreamOutput,
  formatStreamResult,
  formatTable,
  parseOutputMode,
};
