import * as vscode from 'vscode';
import { LogParser } from './LogParser';
import { LogPanelProvider } from './LogPanelProvider';
import { BlockPatterns, PRESETS } from './types';

let panelProvider: LogPanelProvider;
let parser: LogParser;

export function activate(context: vscode.ExtensionContext) {
  panelProvider = new LogPanelProvider(context.extensionUri);
  const patterns = resolvePatterns();
  const lineStripPattern = vscode.workspace.getConfiguration('flutterLogFold').get<string>('lineStripPattern', '');

  parser = new LogParser(patterns, lineStripPattern, (entry) => {
    panelProvider.addEntry(entry);
  });

  // Register webview provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(LogPanelProvider.viewType, panelProvider)
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('flutterLogFold.show', () => {
      vscode.commands.executeCommand('flutterLogFold.logView.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('flutterLogFold.clear', () => {
      panelProvider.clearAll();
    })
  );

  // Register debug adapter tracker
  context.subscriptions.push(
    vscode.debug.registerDebugAdapterTrackerFactory('dart', {
      createDebugAdapterTracker(session: vscode.DebugSession) {
        // Auto-open panel if configured
        const autoOpen = vscode.workspace.getConfiguration('flutterLogFold').get<boolean>('autoOpen', true);
        if (autoOpen) {
          vscode.commands.executeCommand('flutterLogFold.logView.focus');
        }

        return {
          onDidSendMessage(message: any) {
            if (
              message.type === 'event' &&
              message.event === 'output' &&
              message.body?.output
            ) {
              const category = message.body.category;
              if (category === 'stdout' || category === 'stderr' || category === 'console') {
                const raw = message.body.output;
                // DEBUG: check for ANSI codes in raw output
                if (raw.includes('\x1b')) {
                  console.log('[FLF] ANSI found, first 100 chars:', JSON.stringify(raw.substring(0, 100)));
                } else if (raw.includes('[0m') || raw.includes('[3')) {
                  console.log('[FLF] Partial ANSI (no ESC):', JSON.stringify(raw.substring(0, 100)));
                }
                parser.processOutput(raw);
              }
            }
          },
          onWillStopSession() {
            parser.flush();
          },
        };
      },
    })
  );

  // Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('flutterLogFold')) {
        const newPatterns = resolvePatterns();
        const newLineStrip = vscode.workspace.getConfiguration('flutterLogFold').get<string>('lineStripPattern', '');
        parser.updatePatterns(newPatterns, newLineStrip);
        panelProvider.updateSettings();
      }
    })
  );
}

function resolvePatterns(): BlockPatterns {
  const config = vscode.workspace.getConfiguration('flutterLogFold');
  const preset = config.get<string>('preset', 'talker');

  if (preset !== 'custom' && PRESETS[preset]) {
    return PRESETS[preset];
  }

  // Custom preset
  const blockStart = config.get<string>('blockStart', '┌──');
  const blockEnd = config.get<string>('blockEnd', '└──');
  const blockContentPrefix = config.get<string>('blockContentPrefix', '│');

  return {
    blockStart: blockStart || '┌──',
    blockEnd: blockEnd || '└──',
    blockContentPrefix: blockContentPrefix || '│',
  };
}

export function deactivate() {
  // Parser flush on deactivation
  parser?.flush();
}
