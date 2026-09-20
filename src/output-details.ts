import type { CodeResult } from './codes.ts';

import { wrapText } from './text.ts';

interface DetailLine {
  label: string;
  style: 'dim' | 'warning';
  text: string;
}

const linesFor = (
  text: string,
  width: number,
  options: Pick<DetailLine, 'label' | 'style'>,
): DetailLine[] => {
  let currentLabel = options.label;
  return wrapText(text, width).map((line) => {
    const result = { label: currentLabel, style: options.style, text: line };
    currentLabel = '';
    return result;
  });
};

const detailLinesFor = (result: CodeResult, width: number): DetailLine[] => {
  const lines =
    result.evidence?.flatMap(({ quote }) =>
      linesFor(`“${quote}”`, width, { label: 'Evidence', style: 'dim' }),
    ) ?? [];
  if (result.review !== undefined) {
    lines.push(
      ...linesFor(result.review.action, width, {
        label: 'Action',
        style: 'warning',
      }),
    );
  }
  return lines;
};

export type { DetailLine };
export { detailLinesFor };
