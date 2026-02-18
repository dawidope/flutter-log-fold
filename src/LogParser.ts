import { LogEntry, LogCategory, LogSource, BlockPatterns } from './types';

const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;
const ANDROID_LOG_PREFIX = /^([A-Z])\/(\S+)\s*\(\d+\):\s?/;

interface CategoryRule {
  category: LogCategory;
  keywords: RegExp;
}

// Priority order: error > warning > http > bloc > debug > verbose > info
const CATEGORY_RULES: CategoryRule[] = [
  { category: 'error', keywords: /\b(ERROR|Exception|FAILURE)\b|(?<![a-zA-Z])Error(?![a-zA-Z])/i },
  { category: 'warning', keywords: /\b(WARNING|Warning|WARN)\b/ },
  { category: 'http', keywords: /\b(HTTP|Request|Response|GET|POST|PUT|DELETE|PATCH|Status:)\b/i },
  { category: 'bloc', keywords: /\b(bloc-transition|Cubit changed|Bloc changed)\b/i },
  { category: 'debug', keywords: /\bDEBUG\b/ },
  { category: 'verbose', keywords: /\bVERBOSE\b/ },
];

const MAX_SUMMARY_LENGTH = 120;
const MAX_BLOCK_BUFFER = 1000;

export class LogParser {
  private nextId = 1;
  private inBlock = false;
  private blockDisplayBuffer: string[] = [];
  private blockDetectBuffer: string[] = [];
  private blockSource: LogSource = 'flutter';
  private patterns: BlockPatterns;
  private lineStripRegex: RegExp | null = null;
  private onEntry: (entry: LogEntry) => void;

  constructor(patterns: BlockPatterns, lineStripPattern: string, onEntry: (entry: LogEntry) => void) {
    this.patterns = patterns;
    this.onEntry = onEntry;
    this.setLineStripRegex(lineStripPattern);
  }

  updatePatterns(patterns: BlockPatterns, lineStripPattern: string): void {
    this.patterns = patterns;
    this.setLineStripRegex(lineStripPattern);
  }

  processOutput(text: string): void {
    const lines = text.split('\n');
    for (const line of lines) {
      if (line === '') { continue; }
      this.processLine(line);
    }
  }

  flush(): void {
    if (this.inBlock && this.blockDisplayBuffer.length > 0) {
      this.emitBlock();
    }
  }

  private setLineStripRegex(pattern: string): void {
    if (pattern) {
      try { this.lineStripRegex = new RegExp(pattern); }
      catch { this.lineStripRegex = null; }
    } else {
      this.lineStripRegex = null;
    }
  }

  private processLine(rawLine: string): void {
    // cleanLine: ANSI-stripped, for detection/summary/category
    // displayLine: keeps ANSI codes, for storage/display
    const cleanLine = stripAnsi(rawLine);
    let displayLine = rawLine;

    // Detect and strip Android log prefix from both
    let source: LogSource = 'flutter';
    let detectLine = cleanLine;
    const androidMatch = cleanLine.match(ANDROID_LOG_PREFIX);
    if (androidMatch) {
      source = androidMatch[2].toLowerCase() === 'flutter' ? 'flutter' : 'system';
      detectLine = cleanLine.replace(ANDROID_LOG_PREFIX, '');
      // Prefix is plain text (no ANSI), safe to strip from raw line
      displayLine = rawLine.replace(androidMatch[0], '');
    }

    // lineStripPattern on detection line only
    if (this.lineStripRegex) {
      detectLine = detectLine.replace(this.lineStripRegex, '');
    }

    // Block detection using detectLine
    if (detectLine.includes(this.patterns.blockStart)) {
      if (this.inBlock && this.blockDisplayBuffer.length > 0) {
        this.emitBlock();
      }
      this.inBlock = true;
      this.blockDisplayBuffer = [displayLine];
      this.blockDetectBuffer = [detectLine];
      this.blockSource = source;
      return;
    }

    if (this.inBlock) {
      if (detectLine.includes(this.patterns.blockEnd)) {
        this.blockDisplayBuffer.push(displayLine);
        this.blockDetectBuffer.push(detectLine);
        this.emitBlock();
        return;
      }

      this.blockDisplayBuffer.push(displayLine);
      this.blockDetectBuffer.push(detectLine);

      if (this.blockDisplayBuffer.length > MAX_BLOCK_BUFFER) {
        this.emitBlock();
      }
      return;
    }

    // Plain line
    this.emitPlain(displayLine, detectLine, source);
  }

  private emitBlock(): void {
    const { detect: cleanLines, display: displayLines } =
      this.cleanBlockLines(this.blockDetectBuffer, this.blockDisplayBuffer);
    const summary = this.extractSummary(cleanLines);
    const category = detectCategory(cleanLines.join(' '));

    const entry: LogEntry = {
      id: this.nextId++,
      type: 'talker-block',
      timestamp: formatTimestamp(),
      summary,
      lines: displayLines,
      category,
      source: this.blockSource,
    };

    this.inBlock = false;
    this.blockDisplayBuffer = [];
    this.blockDetectBuffer = [];
    this.onEntry(entry);
  }

  private emitPlain(displayLine: string, detectLine: string, source: LogSource): void {
    const summaryText = detectLine.length > MAX_SUMMARY_LENGTH
      ? detectLine.substring(0, MAX_SUMMARY_LENGTH) + '...'
      : detectLine;

    const entry: LogEntry = {
      id: this.nextId++,
      type: 'plain',
      timestamp: formatTimestamp(),
      summary: summaryText,
      lines: [displayLine],
      category: detectCategory(detectLine),
      source,
    };
    this.onEntry(entry);
  }

  private cleanBlockLines(
    detectLines: string[],
    displayLines: string[],
  ): { detect: string[]; display: string[] } {
    const detectResult: string[] = [];
    const displayResult: string[] = [];
    const { blockStart, blockEnd, blockContentPrefix } = this.patterns;

    for (let i = 0; i < detectLines.length; i++) {
      const dLine = detectLines[i];
      const rLine = displayLines[i];

      // Skip pure marker lines (check on clean detection line)
      const trimmed = dLine.trim();
      if (this.isMarkerLine(trimmed, blockStart) || this.isMarkerLine(trimmed, blockEnd)) {
        continue;
      }

      let cleanedD = dLine;
      let cleanedR = rLine;

      // Strip blockContentPrefix
      if (blockContentPrefix) {
        const prefixIdx = dLine.indexOf(blockContentPrefix);
        if (prefixIdx !== -1 && dLine.substring(0, prefixIdx).trim() === '') {
          // Clean detection line
          cleanedD = dLine.substring(prefixIdx + blockContentPrefix.length);
          if (cleanedD.startsWith(' ')) { cleanedD = cleanedD.substring(1); }

          // Display line: strip only the prefix char, preserve ANSI codes before it
          const esc = '\x1b';
          const prefixEscaped = blockContentPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const rawRegex = new RegExp(
            '^((?:' + esc + '\\[[0-9;]*[a-zA-Z])*)\\s*' + prefixEscaped + ' ?'
          );
          cleanedR = rLine.replace(rawRegex, '$1');
        }
      }

      detectResult.push(cleanedD);
      displayResult.push(cleanedR);
    }

    return { detect: detectResult, display: displayResult };
  }

  private isMarkerLine(trimmed: string, marker: string): boolean {
    if (trimmed === marker) { return true; }
    if (trimmed.startsWith(marker)) {
      const rest = trimmed.substring(marker.length).trim();
      return /^[-─═]*$/.test(rest);
    }
    return false;
  }

  private extractSummary(cleanedLines: string[]): string {
    for (const line of cleanedLines) {
      const trimmed = line.trim();
      if (trimmed.length > 0) {
        return trimmed.length > MAX_SUMMARY_LENGTH
          ? trimmed.substring(0, MAX_SUMMARY_LENGTH) + '...'
          : trimmed;
      }
    }
    return '(empty block)';
  }
}

function stripAnsi(line: string): string {
  return line.replace(ANSI_REGEX, '');
}

function detectCategory(text: string): LogCategory {
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.test(text)) {
      return rule.category;
    }
  }
  return 'info';
}

function formatTimestamp(): string {
  const now = new Date();
  return now.toTimeString().substring(0, 8);
}
