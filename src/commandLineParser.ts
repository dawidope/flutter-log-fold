export interface ParsedCommand {
  executable: string;
  args: string[];
  commandLine: string;
}

export function parseCommandLine(command: string): ParsedCommand | undefined {
  const tokens = tokenizeCommandLine(command.trim());
  if (tokens.length === 0) {
    return undefined;
  }

  if (isFlutterExecutable(tokens[0])) {
    tokens.shift();
    return {
      executable: 'flutter',
      args: tokens,
      commandLine: ['flutter', ...tokens].join(' '),
    };
  }

  const [executable, ...args] = tokens;
  return {
    executable,
    args,
    commandLine: [executable, ...args].join(' '),
  };
}

function tokenizeCommandLine(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | '\'' | null = null;
  let escaped = false;

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];

    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (character === '\\') {
      const nextCharacter = command[index + 1];
      if (nextCharacter && (nextCharacter === '"' || nextCharacter === '\'' || nextCharacter === '\\' || /\s/.test(nextCharacter))) {
        escaped = true;
        continue;
      }

      current += character;
      continue;
    }

    if (quote) {
      if (character === quote) {
        quote = null;
      } else {
        current += character;
      }

      continue;
    }

    if (character === '"' || character === '\'') {
      quote = character;
      continue;
    }

    if (/\s/.test(character)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += character;
  }

  if (escaped) {
    current += '\\';
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

function isFlutterExecutable(token: string): boolean {
  return /^flutter(?:\.(?:bat|cmd|exe))?$/i.test(token);
}