import { describe, expect, it } from 'vitest';
import { parseCommandLine } from '../src/commandLineParser';

describe('parseCommandLine', () => {
  it('strips a leading flutter executable', () => {
    expect(parseCommandLine('flutter run --debug')).toEqual({
      executable: 'flutter',
      args: ['run', '--debug'],
      commandLine: 'flutter run --debug',
    });
  });

  it('keeps quoted arguments intact', () => {
    expect(parseCommandLine('flutter run --dart-define="API_URL=https://example.com/api v1"')).toEqual({
      executable: 'flutter',
      args: ['run', '--dart-define=API_URL=https://example.com/api v1'],
      commandLine: 'flutter run --dart-define=API_URL=https://example.com/api v1',
    });
  });

  it('preserves non-flutter prefixes', () => {
    expect(parseCommandLine('dart run tool.dart')).toEqual({
      executable: 'dart',
      args: ['run', 'tool.dart'],
      commandLine: 'dart run tool.dart',
    });
  });
});