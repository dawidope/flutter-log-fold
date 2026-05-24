import * as vscode from 'vscode';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { parseCommandLine } from './commandLineParser';

export interface FlutterCommandRunnerOptions {
  title: string;
  defaultCommand: string;
  placeholder: string;
  onOutput: (text: string) => void;
  cwd?: string;
}

export interface FlutterTraceSession extends vscode.Disposable {
  readonly commandLine: string;
  readonly onDidStop: vscode.Event<void>;
  stop(): void;
}

export async function promptAndRunFlutterCommand(options: FlutterCommandRunnerOptions): Promise<FlutterTraceSession | undefined> {
  const command = await vscode.window.showInputBox({
    prompt: 'Edit the command then press Enter to run',
    value: options.defaultCommand,
    placeHolder: options.placeholder,
  });

  if (!command) {
    return undefined;
  }

  const parsed = parseCommandLine(command);
  if (!parsed) {
    return undefined;
  }

  const pty = new FlutterCommandPseudoterminal(parsed.executable, parsed.args, options.onOutput, options.cwd);
  const terminal = vscode.window.createTerminal({ name: options.title, pty });
  const session = new FlutterTraceSessionImpl(parsed.commandLine, terminal, pty);
  terminal.show(true);
  return session;
}

class FlutterCommandPseudoterminal implements vscode.Pseudoterminal, vscode.Disposable {
  private readonly writeEmitter = new vscode.EventEmitter<string>();
  private readonly closeEmitter = new vscode.EventEmitter<number | void>();
  private childProcess?: ChildProcessWithoutNullStreams;
  private childPid?: number;
  private parserBuffer = '';
  private disposed = false;
  private hasClosed = false;

  public readonly onDidWrite = this.writeEmitter.event;
  public readonly onDidClose = this.closeEmitter.event;

  constructor(
    private readonly executable: string,
    private readonly args: string[],
    private readonly onOutput: (text: string) => void,
    private readonly cwd?: string,
  ) {}

  open(): void {
    this.writeEmitter.fire(`> ${this.executable} ${this.args.join(' ')}\r\n`);

    this.childProcess = spawn(this.executable, this.args, {
      cwd: this.cwd,
      env: { ...process.env },
      shell: true,
    });

    this.childPid = this.childProcess.pid;

    this.childProcess.stdout.setEncoding('utf8');
    this.childProcess.stderr.setEncoding('utf8');

    this.childProcess.stdout.on('data', (data: string) => this.forwardOutput(data));
    this.childProcess.stderr.on('data', (data: string) => this.forwardOutput(data));

    this.childProcess.on('error', (error) => {
      this.writeEmitter.fire(`\r\n[flutter-log-fold] failed to start ${this.executable}: ${error.message}\r\n`);
      this.finish(1, true);
    });

    this.childProcess.on('close', (code) => {
      this.flushParserBuffer();
      this.finish(code ?? undefined, true);
    });
  }

  handleInput(data: string): void {
    if (!this.childProcess?.stdin.writable) {
      return;
    }

    if (data === '\u0003') {
      this.terminateProcessTree();
      return;
    }

    this.childProcess.stdin.write(data);
  }

  close(): void {
    this.disposed = true;
    this.terminateProcessTree();
    this.flushParserBuffer();
    this.finish(undefined, false);
  }

  dispose(): void {
    this.disposed = true;
    this.terminateProcessTree();
    this.flushParserBuffer();
    this.finish(undefined, false);
    this.writeEmitter.dispose();
    this.closeEmitter.dispose();
  }

  private forwardOutput(data: string): void {
    this.writeEmitter.fire(data);
    this.parserBuffer += data.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    let newlineIndex = this.parserBuffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const chunk = this.parserBuffer.slice(0, newlineIndex + 1);
      this.onOutput(chunk);
      this.parserBuffer = this.parserBuffer.slice(newlineIndex + 1);
      newlineIndex = this.parserBuffer.indexOf('\n');
    }
  }

  private flushParserBuffer(): void {
    if (this.parserBuffer.length > 0) {
      this.onOutput(this.parserBuffer);
      this.parserBuffer = '';
    }
  }

  private finish(exitCode: number | undefined, emitTerminalMessage: boolean): void {
    if (this.hasClosed) {
      return;
    }

    this.hasClosed = true;
    if (emitTerminalMessage && !this.disposed) {
      this.writeEmitter.fire(`\r\n[flutter-log-fold] process exited with code ${exitCode ?? 'unknown'}\r\n`);
    }
    this.closeEmitter.fire(exitCode);
  }

  private terminateProcessTree(): void {
    const pid = this.childPid;
    if (!pid) {
      return;
    }

    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { windowsHide: true });
      killer.on('error', () => {
        this.childProcess?.kill();
      });
      return;
    }

    this.childProcess?.kill('SIGTERM');
  }
}

class FlutterTraceSessionImpl implements FlutterTraceSession {
  private readonly stopEmitter = new vscode.EventEmitter<void>();
  private disposed = false;

  public readonly onDidStop = this.stopEmitter.event;

  constructor(
    public readonly commandLine: string,
    private readonly terminal: vscode.Terminal,
    private readonly pty: FlutterCommandPseudoterminal,
  ) {
    this.pty.onDidClose(() => {
      if (this.disposed) {
        return;
      }

      this.disposed = true;
      this.stopEmitter.fire();
      this.dispose();
    });
  }

  stop(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.terminal.dispose();
    this.stopEmitter.fire();
    this.dispose();
  }

  dispose(): void {
    this.disposed = true;
    this.pty.dispose();
    this.stopEmitter.dispose();
  }
}
