export type LogCategory = 'bloc' | 'http' | 'error' | 'warning' | 'info' | 'debug' | 'verbose';

export type LogSource = 'flutter' | 'system';

export interface LogEntry {
  id: number;
  type: 'talker-block' | 'plain';
  timestamp: string;
  summary: string;
  lines: string[];
  category: LogCategory;
  source: LogSource;
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
