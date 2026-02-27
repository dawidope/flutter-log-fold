# Changelog

All notable changes to the **Flutter Log Fold** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] - 2026-02-28

### Added
- iOS/macOS `flutter: ` log prefix stripping — logs from iOS Simulator and macOS runner are now parsed correctly.
- ANSI escape normalization for macOS — the macOS debug adapter sends ESC as literal `\^[` instead of the real ESC byte; these are now converted before parsing, so ANSI colors render properly.
- System log detection for iOS/macOS — lines without the `flutter: ` prefix are now classified as system logs and filtered by the SYS chip.
- "How it works" section in README explaining that the extension parses raw Debug Console text output.
- "Troubleshooting" section in README documenting the known Flutter issue with missing logs on physical iOS devices.

[0.2.1]: https://github.com/dawidope/flutter-log-fold/compare/v0.1.0...v0.2.1

## [0.1.0] - 2026-02-25

### Added

#### Log Capture and Parsing
- Real-time log capture from Flutter debug sessions via the Debug Adapter Protocol (stdout, stderr, console).
- Block detection for box-drawing log formats: recognizes block-start, block-end, and content-prefix markers.
- Built-in presets for common Flutter logging libraries:
  - **talker** preset for Talker / talker_flutter / talker_dio_logger (markers: `┌│└`).
  - **pretty** preset for pretty_dio_logger / logger (markers: `╔║╚`).
  - **custom** preset with user-defined `blockStart`, `blockEnd`, and `blockContentPrefix` values.
- Automatic log category detection using `[tag]` patterns (e.g., `[error]`, `[http-request]`) and keyword-based fallback rules (ERROR, WARNING, DEBUG, VERBOSE, CRITICAL, FATAL).
- Dynamic tag discovery: any `[tag]` in log output automatically becomes a filterable category.
- Android logcat prefix stripping with automatic flutter/system source classification.
- Configurable `lineStripPattern` regex for stripping arbitrary process prefixes from log lines.
- Configurable `maxBlockLines` limit to force-emit oversized blocks (default 50,000 lines).

#### Formatter Plugins
- Pluggable formatter registry with tag-based dispatch and fallback support.
- **Bloc formatter** (`talkerBlocFormat` setting): condenses `bloc-transition`, `bloc-create`, and `bloc-close` blocks into concise one-line summaries (e.g., `[bloc-transition] MyCubit | OldState -> NewState`).
- **Route formatter** (`talkerRouteFormat` setting): condenses `route` blocks into one-line summaries (e.g., `[route] Open route named home`).
- **Talker default formatter** (`talkerStripTimestamp` setting): strips `| HH:MM:SS xxxms |` timestamps from block summaries for tags without a specific formatter.

#### Webview Panel
- Dedicated "Flutter Logs" panel registered in the VS Code bottom panel area.
- Foldable log blocks rendered as collapsible `<details>` elements with arrow indicators, category badges, and timestamps.
- Plain (non-block) log lines rendered inline with category badges.
- ANSI color rendering: full support for SGR attributes including bold, italic, underline, dim, standard colors (30-37, 40-47), bright colors (90-97, 100-107), 256-color mode (38;5;n / 48;5;n), and 24-bit true color (38;2;r;g;b / 48;2;r;g;b). Colors map to VS Code terminal theme variables.
- Collapsible JSON tree viewer: automatically detects JSON objects and arrays inside block content and renders them as interactive, syntax-highlighted, foldable trees (objects and arrays auto-expand to depth 2).
- Handling of truncated JSON: repairs unclosed strings from logcat line-length limits and fixes raw newlines inside JSON string values.

#### Filtering and Navigation
- Free-text filter input with case-insensitive substring matching across all log content (ANSI-stripped).
- Category chip bar with toggleable severity chips (INFO, ERROR, WARN, DEBUG, VERBOSE, CRITICAL) and dynamically created tag chips with deterministic HSL colors.
- ALL chip to toggle all categories at once.
- SYS chip to show or hide system-source logs (e.g., Choreographer, BillingClient).
- Live counter displaying visible vs. total log entries.
- Collapse All / Expand All buttons for bulk fold control.
- Clear button to remove all logs from the panel and internal buffer.
- Smart auto-scroll: stays pinned to the bottom while new logs arrive, but stops following when the user scrolls up.

#### Commands
- `Flutter Logs: Show Panel` command to focus the log panel.
- `Flutter Logs: Clear` command to clear all logs.

#### Settings
- `flutterLogFold.autoOpen` -- automatically open the log panel when a debug session starts (default: true).
- `flutterLogFold.collapseByDefault` -- collapse new log blocks by default (default: true).
- `flutterLogFold.maxLogs` -- maximum number of log entries kept in the panel buffer, range 50-10,000 (default: 500).
- `flutterLogFold.maxBlockLines` -- maximum lines per block before force-emit, range 500-200,000 (default: 50,000).
- `flutterLogFold.preset` -- block pattern preset: `talker`, `pretty`, or `custom` (default: talker).
- `flutterLogFold.blockStart`, `blockEnd`, `blockContentPrefix` -- custom block markers (only used when preset is `custom`).
- `flutterLogFold.talkerBlocFormat` -- enable bloc plugin formatter (default: true).
- `flutterLogFold.talkerRouteFormat` -- enable route observer formatter (default: true).
- `flutterLogFold.talkerStripTimestamp` -- strip Talker timestamps from summaries (default: true).
- `flutterLogFold.lineStripPattern` -- optional regex to strip process prefixes from every line (default: empty/disabled).
- All settings apply immediately on change without requiring a restart.

[0.1.0]: https://github.com/dawidope/flutter-log-fold/releases/tag/v0.1.0
