import { LogEntry, LogCategory, LogSource, BlockPatterns, ParserSettings, SEVERITY_LEVELS } from './types';
import { FormatterRegistry } from './formatters/registry';
import { blocFormatters } from './formatters/bloc';
import { routeFormatters } from './formatters/route';
import { talkerDefaultFormatter } from './formatters/talker-default';

const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;
const ANDROID_LOG_PREFIX = /^([A-Z])\/(\S+)\s*\(\s*\d+\):\s?/;
const TAG_REGEX = /\[([a-zA-Z][a-zA-Z0-9]*?)(?:-[^\]]*)??\]/;

interface CategoryRule {
  category: LogCategory;
  keywords: RegExp;
}

// Keyword-based fallback rules (priority order)
const CATEGORY_RULES: CategoryRule[] = [
  { category: 'critical', keywords: /\b(CRITICAL|FATAL)\b/i },
  { category: 'error', keywords: /\b(ERROR|Exception|FAILURE)\b|(?<![a-zA-Z])Error(?![a-zA-Z])/i },
  { category: 'warn', keywords: /\b(WARNING|Warning|WARN)\b/ },
  { category: 'debug', keywords: /\bDEBUG\b/ },
  { category: 'verbose', keywords: /\bVERBOSE\b/ },
];

const MAX_SUMMARY_LENGTH = 120;
const DEFAULT_MAX_BLOCK_LINES = 50_000;
const TAG_SCAN_LIMIT = 100;

const severitySet = new Set<string>(SEVERITY_LEVELS);

export class LogParser {
  private nextId = 1;
  private inBlock = false;
  private blockDisplayBuffer: string[] = [];
  private blockDetectBuffer: string[] = [];
  private blockSource: LogSource = 'flutter';
  private patterns: BlockPatterns;
  private lineStripRegex: RegExp | null = null;
  private blockPrefixRegex: RegExp | null = null;
  private onEntry: (entry: LogEntry) => void;
  private knownTags = new Set<string>();
  private registry = new FormatterRegistry();
  private settings: ParserSettings;

  constructor(patterns: BlockPatterns, lineStripPattern: string, settings: ParserSettings, onEntry: (entry: LogEntry) => void) {
    this.patterns = patterns;
    this.settings = settings;
    this.onEntry = onEntry;
    this.setLineStripRegex(lineStripPattern);
    this.buildBlockPrefixRegex();
    this.applySettings();
  }

  updatePatterns(patterns: BlockPatterns, lineStripPattern: string): void {
    this.patterns = patterns;
    this.setLineStripRegex(lineStripPattern);
    this.buildBlockPrefixRegex();
  }

  updateSettings(settings: ParserSettings): void {
    this.settings = settings;
    this.applySettings();
  }

  private applySettings(): void {
    // Bloc formatters
    if (this.settings.talkerBlocFormat) {
      this.registry.register(blocFormatters);
    } else {
      this.registry.unregister(blocFormatters);
    }
    // Route formatters
    if (this.settings.talkerRouteFormat) {
      this.registry.register(routeFormatters);
    } else {
      this.registry.unregister(routeFormatters);
    }
    // Default talker timestamp stripping (fallback)
    this.registry.setFallback(this.settings.talkerStripTimestamp ? talkerDefaultFormatter : null);
  }

  getKnownTags(): string[] {
    return Array.from(this.knownTags);
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


  private buildBlockPrefixRegex(): void {
    const prefix = this.patterns.blockContentPrefix;
    if (prefix) {
      const esc = '\x1b';
      const prefixEscaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      this.blockPrefixRegex = new RegExp(
        '^((?:' + esc + '\\[[0-9;]*[a-zA-Z])*)\\s*' + prefixEscaped + ' ?'
      );
    } else {
      this.blockPrefixRegex = null;
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
      // Line from a different source (e.g. W/BillingClient during I/flutter block)
      // — emit as standalone plain log, don't pollute the block buffer
      if (source !== this.blockSource) {
        this.emitPlain(displayLine, detectLine, source);
        return;
      }

      if (detectLine.includes(this.patterns.blockEnd)) {
        this.blockDisplayBuffer.push(displayLine);
        this.blockDetectBuffer.push(detectLine);
        this.emitBlock();
        return;
      }

      this.blockDisplayBuffer.push(displayLine);
      this.blockDetectBuffer.push(detectLine);

      if (this.blockDisplayBuffer.length > (this.settings.maxBlockLines || DEFAULT_MAX_BLOCK_LINES)) {
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
    // For blocks: scan first content line for tag pattern
    const firstLine = cleanLines.length > 0 ? cleanLines[0] : '';
    const category = this.detectCategory(firstLine);
    const formatted = this.formatBlockSummary(cleanLines);
    const summary = formatted ?? this.extractSummary(cleanLines);

    const entry: LogEntry = {
      id: this.nextId++,
      type: 'talker-block',
      timestamp: formatTimestamp(),
      summary,
      lines: displayLines,
      category,
      source: this.blockSource,
      formattedSummary: formatted !== null,
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
      category: this.detectCategory(detectLine),
      source,
    };
    this.onEntry(entry);
  }

  private detectCategory(text: string): LogCategory {
    // Phase 1: Scan first 100 chars for [tag] or [tag-something] pattern
    const scanText = text.substring(0, TAG_SCAN_LIMIT);
    const tagMatch = scanText.match(TAG_REGEX);

    if (tagMatch) {
      const tagName = tagMatch[1].toLowerCase();

      // Phase 2: If tag matches a severity level, return that severity
      if (severitySet.has(tagName)) {
        return tagName;
      }

      // Phase 3: Return as dynamic tag
      this.knownTags.add(tagName);
      return tagName;
    }

    // Phase 4: Fall back to keyword-based severity rules
    for (const rule of CATEGORY_RULES) {
      if (rule.keywords.test(text)) {
        return rule.category;
      }
    }

    // Phase 5: Default
    return 'info';
  }

  private formatBlockSummary(cleanLines: string[]): string | null {
    if (cleanLines.length < 1) { return null; }
    const header = cleanLines[0].trim();
    const tagMatch = header.match(/^\[([a-zA-Z][a-zA-Z0-9]*(?:-[^\]]*)?)\]/);
    if (!tagMatch) { return null; }
    return this.registry.format(tagMatch[1].toLowerCase(), cleanLines);
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
          if (this.blockPrefixRegex) {
            cleanedR = rLine.replace(this.blockPrefixRegex, '$1');
          }
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

function formatTimestamp(): string {
  const now = new Date();
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return now.toTimeString().substring(0, 8) + '.' + ms;
}
