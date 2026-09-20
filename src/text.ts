const ZERO = 0;
const ONE = 1;

const wrapText = (value: string, width: number): string[] => {
  const lines: string[] = [];
  let remaining = value.trim();
  while (remaining.length > width) {
    let breakAt = remaining.lastIndexOf(' ', width);
    if (breakAt <= ZERO) {
      breakAt = width;
    }
    lines.push(remaining.slice(ZERO, breakAt));
    remaining = remaining.slice(breakAt).trimStart();
  }
  if (remaining !== '') {
    lines.push(remaining);
  }
  return lines;
};

const truncate = (value: string, width: number): string => {
  if (value.length <= width) {
    return value;
  }
  return `${value.slice(ZERO, width - ONE)}…`;
};

export { truncate, wrapText };
