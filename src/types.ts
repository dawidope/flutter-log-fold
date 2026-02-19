export type LogCategory = string;

export const SEVERITY_LEVELS = ['info', 'error', 'warn', 'debug', 'verbose', 'critical'] as const;

export type LogSource = 'flutter' | 'system';

export interface LogEntry {
  id: number;
  type: 'talker-block' | 'plain';
  timestamp: string;
  summary: string;
  lines: string[];
  category: LogCategory;
  source: LogSource;
  formattedSummary?: boolean;
}

export interface BlockPatterns {
  blockStart: string;
  blockEnd: string;
  blockContentPrefix: string;
}

export interface ExtensionToWebviewMessage {
  command: 'log' | 'batch' | 'clear' | 'settings';
  entry?: LogEntry;
  entries?: LogEntry[];
  knownTags?: string[];
  collapseByDefault?: boolean;
}

export interface WebviewToExtensionMessage {
  command: 'clear';
}

export const PRESETS: Record<string, BlockPatterns> = {
  talker: {
    blockStart: '┌──',
    blockEnd: '└──',
    blockContentPrefix: '│',
  },
  pretty: {
    blockStart: '╔══',
    blockEnd: '╚══',
    blockContentPrefix: '║',
  },
};
