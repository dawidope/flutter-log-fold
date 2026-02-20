import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { LogEntry, ExtensionToWebviewMessage } from './types';

export class LogPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'flutterLogFold.logView';

  private view?: vscode.WebviewView;
  private buffer: LogEntry[] = [];
  private maxLogs: number;
  private collapseByDefault: boolean;
  private readonly extensionUri: vscode.Uri;
  private knownTagsGetter?: () => string[];
  private viewDisposables: vscode.Disposable[] = [];

  constructor(extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri;
    const config = vscode.workspace.getConfiguration('flutterLogFold');
    this.maxLogs = config.get<number>('maxLogs', 500);
    this.collapseByDefault = config.get<boolean>('collapseByDefault', true);
  }

  setKnownTagsGetter(getter: () => string[]): void {
    this.knownTagsGetter = getter;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    // Dispose previous listeners (in case resolveWebviewView is called again)
    this.viewDisposables.forEach(d => d.dispose());
    this.viewDisposables = [];

    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'webview')],
    };

    webviewView.webview.html = this.getHtmlContent(webviewView.webview);

    // Send buffered logs when webview becomes visible
    this.viewDisposables.push(webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible && this.buffer.length > 0) {
        this.postMessage({ command: 'batch', entries: this.buffer, knownTags: this.knownTagsGetter?.() });
        this.postMessage({ command: 'settings', collapseByDefault: this.collapseByDefault, maxLogs: this.maxLogs });
      }
    }));

    // Handle messages from webview
    this.viewDisposables.push(webviewView.webview.onDidReceiveMessage((message) => {
      if (message.command === 'ready') {
        this.postMessage({ command: 'settings', collapseByDefault: this.collapseByDefault, maxLogs: this.maxLogs });
        if (this.buffer.length > 0) {
          this.postMessage({ command: 'batch', entries: this.buffer, knownTags: this.knownTagsGetter?.() });
        }
      }
      if (message.command === 'clear') {
        this.buffer = [];
      }
    }));

    // Clean up when the view is disposed
    this.viewDisposables.push(webviewView.onDidDispose(() => {
      this.viewDisposables.forEach(d => d.dispose());
      this.viewDisposables = [];
    }));
  }

  addEntry(entry: LogEntry): void {
    this.buffer.push(entry);

    // Enforce maxLogs limit
    while (this.buffer.length > this.maxLogs) {
      this.buffer.shift();
    }

    this.postMessage({ command: 'log', entry });
  }

  clearAll(): void {
    this.buffer = [];
    this.postMessage({ command: 'clear' });
  }

  updateSettings(): void {
    const config = vscode.workspace.getConfiguration('flutterLogFold');
    this.maxLogs = config.get<number>('maxLogs', 500);
    this.collapseByDefault = config.get<boolean>('collapseByDefault', true);

    // Trim buffer if maxLogs decreased
    while (this.buffer.length > this.maxLogs) {
      this.buffer.shift();
    }

    this.postMessage({ command: 'settings', collapseByDefault: this.collapseByDefault, maxLogs: this.maxLogs });
  }

  private postMessage(message: ExtensionToWebviewMessage): void {
    this.view?.webview.postMessage(message);
  }

  private getHtmlContent(webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview', 'style.css')
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview', 'main.js')
    );

    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet">
  <title>Flutter Logs</title>
</head>
<body>
  <div class="toolbar">
    <div class="toolbar-row">
      <button id="btn-clear" title="Clear all logs">Clear</button>
      <button id="btn-collapse" title="Collapse all blocks">Collapse All</button>
      <button id="btn-expand" title="Expand all blocks">Expand All</button>
      <input type="text" id="input-filter" placeholder="Filter..." title="Filter logs by text (case-insensitive)">
      <span id="counter" class="counter">0 / 0</span>
    </div>
    <div class="chip-bar" id="chip-bar">
      <button class="chip active" data-category="all">ALL</button>
      <span class="chip-separator" id="chip-separator"></span>
      <button class="chip source-chip" data-source="system" id="chip-system" title="Show system logs (Choreographer, etc.)">SYS</button>
    </div>
  </div>
  <div id="log-container" class="log-container"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  return crypto.randomBytes(16).toString('base64url');
}
