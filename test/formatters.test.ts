import { describe, it, expect, beforeEach } from 'vitest';
import { FormatterRegistry, BlockFormatter } from '../src/formatters/registry';
import { blocFormatters } from '../src/formatters/bloc';
import { riverpodFormatters } from '../src/formatters/riverpod';
import { routeFormatters } from '../src/formatters/route';
import { talkerDefaultFormatter } from '../src/formatters/talker-default';

// ── FormatterRegistry ────────────────────────────────────────────────

describe('FormatterRegistry', () => {
  let registry: FormatterRegistry;

  beforeEach(() => {
    registry = new FormatterRegistry();
  });

  it('register + format → returns formatted string', () => {
    const formatter: BlockFormatter = () => 'formatted';
    registry.register({ 'test-tag': formatter });
    expect(registry.format('test-tag', ['line'])).toBe('formatted');
  });

  it('unregister → format returns null (no fallback)', () => {
    const formatter: BlockFormatter = () => 'formatted';
    const group = { 'test-tag': formatter };
    registry.register(group);
    registry.unregister(group);
    expect(registry.format('test-tag', ['line'])).toBeNull();
  });

  it('fallback → used when no specific formatter', () => {
    const fallback: BlockFormatter = () => 'fallback result';
    registry.setFallback(fallback);
    expect(registry.format('unknown-tag', ['line'])).toBe('fallback result');
  });

  it('setFallback(null) → no fallback', () => {
    const fallback: BlockFormatter = () => 'fallback result';
    registry.setFallback(fallback);
    registry.setFallback(null);
    expect(registry.format('unknown-tag', ['line'])).toBeNull();
  });

  it('specific formatter takes priority over fallback', () => {
    const formatter: BlockFormatter = () => 'specific';
    const fallback: BlockFormatter = () => 'fallback';
    registry.register({ 'my-tag': formatter });
    registry.setFallback(fallback);
    expect(registry.format('my-tag', ['line'])).toBe('specific');
  });

  it('unregister only removes if same reference', () => {
    const formatter1: BlockFormatter = () => 'first';
    const formatter2: BlockFormatter = () => 'second';
    registry.register({ tag: formatter1 });
    // Try to unregister with different function ref
    registry.unregister({ tag: formatter2 });
    // Should still be registered
    expect(registry.format('tag', ['line'])).toBe('first');
  });
});

// ── bloc-transition ──────────────────────────────────────────────────

describe('bloc-transition formatter', () => {
  const format = blocFormatters['bloc-transition'];

  it('formats 4-line transition block correctly', () => {
    const lines = [
      '[bloc-transition] | 10:47:22 50ms |',
      'AuthCubit changed',
      'CURRENT state: Unauthenticated',
      'NEXT state: Authenticated',
    ];
    expect(format(lines)).toBe(
      '[bloc-transition] AuthCubit | Unauthenticated -> Authenticated',
    );
  });

  it('returns null for too few lines', () => {
    expect(format(['[bloc-transition] | 10:00:00 1ms |'])).toBeNull();
    expect(format(['header', 'X changed'])).toBeNull();
    expect(format(['header', 'X changed', 'CURRENT state: A'])).toBeNull();
  });

  it('returns null for malformed lines', () => {
    const lines = [
      '[bloc-transition] | 10:00:00 1ms |',
      'not a valid changed line',
      'not a current state',
      'not a next state',
    ];
    expect(format(lines)).toBeNull();
  });
});

// ── bloc-create ──────────────────────────────────────────────────────

describe('bloc-create formatter', () => {
  const format = blocFormatters['bloc-create'];

  it('formats create block correctly', () => {
    const lines = [
      '[bloc-create] | 10:47:22 10ms |',
      'MyCubit created',
    ];
    expect(format(lines)).toBe('[bloc-create] MyCubit');
  });

  it('returns null for too few lines', () => {
    expect(format(['[bloc-create] | 10:00:00 1ms |'])).toBeNull();
  });
});

// ── bloc-close ───────────────────────────────────────────────────────

describe('bloc-close formatter', () => {
  const format = blocFormatters['bloc-close'];

  it('formats close block correctly', () => {
    const lines = [
      '[bloc-close] | 10:47:25 5ms |',
      'MyCubit closed',
    ];
    expect(format(lines)).toBe('[bloc-close] MyCubit');
  });

  it('returns null for too few lines', () => {
    expect(format(['[bloc-close] | 10:00:00 1ms |'])).toBeNull();
  });
});

// ── riverpod-update ──────────────────────────────────────────────────

describe('riverpod-update formatter', () => {
  const format = riverpodFormatters['riverpod-update'];

  it('formats update block correctly', () => {
    const lines = [
      '[riverpod-update] | 17:15:20 898ms |',
      'FutureProvider<Repository> updated',
      'PREVIOUS state:',
      'AsyncLoading<Repository>()',
      'NEW state:',
      "AsyncData<Repository>(value: Instance of 'Repository')",
    ];
    expect(format(lines)).toBe(
      "[riverpod-update] FutureProvider<Repository> | AsyncLoading<Repository>() -> AsyncData<Repository>(value: Instance of 'Repository')",
    );
  });

  it('handles multi-line state values (takes first line only)', () => {
    const lines = [
      '[riverpod-update] | 17:15:20 898ms |',
      'SomeProvider updated',
      'PREVIOUS state:',
      'OldState(',
      '  field: value,',
      ')',
      'NEW state:',
      'NewState(',
      '  field: value,',
      ')',
    ];
    expect(format(lines)).toBe(
      '[riverpod-update] SomeProvider | OldState( -> NewState(',
    );
  });

  it('returns null for too few lines', () => {
    expect(format(['[riverpod-update] | 17:00:00 1ms |'])).toBeNull();
    expect(format(['header', 'X updated', 'PREVIOUS state:', 'A'])).toBeNull();
  });

  it('returns null for malformed lines', () => {
    const lines = [
      '[riverpod-update] | 17:00:00 1ms |',
      'not a valid updated line',
      'PREVIOUS state:',
      'A',
      'NEW state:',
      'B',
    ];
    expect(format(lines)).toBeNull();
  });
});

// ── riverpod-add ─────────────────────────────────────────────────────

describe('riverpod-add formatter', () => {
  const format = riverpodFormatters['riverpod-add'];

  it('formats add block correctly', () => {
    const lines = [
      '[riverpod-add] | 17:15:20 887ms |',
      'FutureProvider<Repository> initialized',
      'INITIAL state:',
      'AsyncLoading<Repository>()',
    ];
    expect(format(lines)).toBe(
      '[riverpod-add] FutureProvider<Repository> | AsyncLoading<Repository>()',
    );
  });

  it('returns null for too few lines', () => {
    expect(format(['[riverpod-add] | 17:00:00 1ms |'])).toBeNull();
    expect(format(['header', 'X initialized'])).toBeNull();
    expect(format(['header', 'X initialized', 'INITIAL state:'])).toBeNull();
  });

  it('returns null for malformed lines', () => {
    const lines = [
      '[riverpod-add] | 17:00:00 1ms |',
      'not a valid initialized line',
      'INITIAL state:',
      'SomeState()',
    ];
    expect(format(lines)).toBeNull();
  });
});

// ── riverpod-dispose ─────────────────────────────────────────────────

describe('riverpod-dispose formatter', () => {
  const format = riverpodFormatters['riverpod-dispose'];

  it('formats dispose block correctly', () => {
    const lines = [
      '[riverpod-dispose] | 17:15:22 378ms |',
      'FutureProvider<Repository> disposed',
    ];
    expect(format(lines)).toBe('[riverpod-dispose] FutureProvider<Repository>');
  });

  it('returns null for too few lines', () => {
    expect(format(['[riverpod-dispose] | 17:00:00 1ms |'])).toBeNull();
  });
});

// ── route ────────────────────────────────────────────────────────────

describe('route formatter', () => {
  const format = routeFormatters['route'];

  it('extracts message after last pipe', () => {
    const lines = ['[route] | 10:47:20 258ms | Action: push, Route: /home'];
    expect(format(lines)).toBe('[route] Action: push, Route: /home');
  });

  it('returns null when no pipe', () => {
    const lines = ['[route] no pipe at all'];
    expect(format(lines)).toBeNull();
  });

  it('returns null for empty lines', () => {
    expect(format([])).toBeNull();
  });
});

// ── talker-default (fallback) ────────────────────────────────────────

describe('talker-default formatter', () => {
  it('strips timestamp: [info] | HH:MM:SS ms | message → [info] message', () => {
    const lines = ['[info] | 10:47:20 258ms | App init'];
    expect(talkerDefaultFormatter(lines)).toBe('[info] App init');
  });

  it('returns just tag when message is empty', () => {
    const lines = ['[info] | 10:47:20 258ms |'];
    expect(talkerDefaultFormatter(lines)).toBe('[info]');
  });

  it('returns null when no match', () => {
    const lines = ['no tag here'];
    expect(talkerDefaultFormatter(lines)).toBeNull();
  });

  it('returns null for empty lines array', () => {
    expect(talkerDefaultFormatter([])).toBeNull();
  });

  it('handles tag with hyphen', () => {
    const lines = ['[my-tag] | 10:47:20 258ms | custom message'];
    expect(talkerDefaultFormatter(lines)).toBe('[my-tag] custom message');
  });
});
