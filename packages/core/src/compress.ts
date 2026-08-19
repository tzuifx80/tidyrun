const FAILURE = /(FAIL|ERROR|Error|AssertionError|×|✗|failed|panic:|E\d{3,}:)/i;
const WARNING = /(WARN|warning:)/i;
const ANSI = /[\u001B\u009B]\][^\u0007]*(?:\u0007|\u001B\\)|[\u001B\u009B]\[[0-?]*[ -/]*[@-~]/g;

/**
 * Return a diagnostic-preserving view of a command result. The original output
 * is stored separately by the engine; this function is deliberately pure so a
 * parser failure can always fall back to the unmodified text.
 */
export function compressOutput(command: string, output: string, maxChars: number): string {
  if (maxChars <= 0) return "";
  const normalized = output.replace(/\r\n?/g, "\n");
  if (normalized.length <= maxChars && normalized.split("\n").length <= 80) return output;
  const parsed = normalized.replace(ANSI, "");
  const lower = command.toLowerCase();
  if (/\bpytest|python\s+-m\s+pytest\b/.test(lower)) return compressPytest(parsed, maxChars);
  if (/\b(vitest|jest)\b/.test(lower)) return compressVitest(parsed, maxChars);
  if (/\btsc(?:\.js)?\b/.test(lower)) return compressTsc(parsed, maxChars);
  if (/\b(?:npm|pnpm|yarn|bun)\b/.test(lower)) return compressPackageManager(parsed, maxChars);
  if (/\bcargo\s+(?:test|check|clippy)\b/.test(lower)) return compressCargo(parsed, maxChars);
  if (/\bgo\s+(?:test|vet)\b/.test(lower)) return compressGo(parsed, maxChars);
  if (/\b(?:ruff|mypy|pyright|pylint|eslint|biome)\b/.test(lower)) return compressDiagnostics(parsed, maxChars);
  return compressGeneric(parsed, maxChars);
}

function compressPytest(output: string, maxChars: number): string {
  const lines = output.split("\n");
  const failed = lines.filter((line) => /^FAILED\s+/i.test(line.trim()) || /^ERROR\s+/i.test(line.trim()));
  const summary = lines.filter((line) => /\b(?:failed|passed|skipped|error|xfailed|warnings?)\b/i.test(line)).slice(-8);
  const windows = contextWindows(lines, (line) => /^(?:FAILED|ERROR)\s+|AssertionError|Traceback|^E\s+/i.test(line.trim()), 2, 14, 30);
  return clip([...unique([...summary, ...failed]), ...windows].filter(Boolean).join("\n"), maxChars);
}

function compressVitest(output: string, maxChars: number): string {
  const lines = output.split("\n");
  const summary = lines.filter((line) => /\b(?:passed|failed|skipped|test files|Tests:)\b/i.test(line)).slice(-10);
  const windows = contextWindows(lines, (line) => /\bFAIL\b|[×✗]|AssertionError|Expected\s|Received\s|Error:/i.test(line), 2, 12, 40);
  return clip([...summary, ...windows].filter(Boolean).join("\n"), maxChars);
}

function compressTsc(output: string, maxChars: number): string {
  const lines = output.split("\n");
  const summary = lines.filter((line) => /Found \d+ errors?|error TS\d+|warning TS\d+/i.test(line) || FAILURE.test(line)).slice(-12);
  const windows = contextWindows(lines, (line) => /error TS\d+|(?:^|\s)error:/i.test(line) || FAILURE.test(line), 1, 4, 80);
  return clip([...summary, ...windows].filter(Boolean).join("\n"), maxChars);
}

function compressPackageManager(output: string, maxChars: number): string {
  const lines = output.split("\n");
  const summary = lines.filter((line) => /\b(?:added|removed|changed|audited|packages|pass|fail|success|done|complete|ERR!|ELIFECYCLE)\b/i.test(line)).slice(-16);
  const windows = contextWindows(lines, (line) => FAILURE.test(line) || /ERR!|ELIFECYCLE|command failed/i.test(line), 2, 8, 60);
  return clip([...summary, ...windows].filter(Boolean).join("\n"), maxChars);
}

function compressCargo(output: string, maxChars: number): string {
  const lines = output.split("\n");
  const summary = lines.filter((line) => /test result:|Finished|error:|warning:|failures:/i.test(line) || FAILURE.test(line)).slice(-20);
  const windows = contextWindows(lines, (line) => FAILURE.test(line) || /^error\b|test .*\.\.\. FAILED|thread .* panicked|^failures:/i.test(line.trim()), 2, 10, 60);
  return clip([...summary, ...windows].filter(Boolean).join("\n"), maxChars);
}

function compressGo(output: string, maxChars: number): string {
  const lines = output.split("\n");
  const summary = lines.filter((line) => /^(?:FAIL|ok|\?\s)|panic:|coverage:/i.test(line.trim())).slice(-20);
  const windows = contextWindows(lines, (line) => /^--- FAIL:|^panic:|^FAIL\s|^\s*Error:/i.test(line.trim()), 2, 12, 50);
  return clip([...summary, ...windows].filter(Boolean).join("\n"), maxChars);
}

function compressDiagnostics(output: string, maxChars: number): string {
  const lines = output.split("\n");
  const summary = lines.filter((line) => /(?:error|warning|fail|passed|fixed|found|✖|✔)/i.test(line)).slice(-20);
  const windows = contextWindows(lines, (line) => /(?:error|failure|traceback|exception)/i.test(line), 1, 8, 80);
  return clip([...summary, ...windows].filter(Boolean).join("\n"), maxChars);
}

function compressGeneric(output: string, maxChars: number): string {
  const lines = output.split("\n");
  const hits = contextWindows(lines, (line) => FAILURE.test(line) || WARNING.test(line), 1, 6, 60);
  const head = lines.slice(0, 12);
  const tail = lines.slice(-12);
  const omitted = Math.max(0, lines.length - head.length - tail.length - hits.length);
  return clip([...head, omitted ? `… ${omitted} non-diagnostic lines omitted …` : "", ...hits, ...tail].filter(Boolean).join("\n"), maxChars);
}

function contextWindows(lines: string[], matches: (line: string) => boolean, before: number, after: number, limit: number): string[] {
  const ranges: Array<[number, number]> = [];
  for (let i = 0; i < lines.length && ranges.length < limit; i += 1) {
    if (!matches(lines[i])) continue;
    const start = Math.max(0, i - before);
    const end = Math.min(lines.length, i + after + 1);
    const previous = ranges[ranges.length - 1];
    if (previous && start <= previous[1]) previous[1] = Math.max(previous[1], end);
    else ranges.push([start, end]);
  }
  return ranges.flatMap(([start, end]) => lines.slice(start, end));
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item || seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

function clip(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const marker = "\n… [truncated]";
  if (maxChars <= marker.length) return text.slice(0, maxChars);
  return `${text.slice(0, maxChars - marker.length)}${marker}`;
}
