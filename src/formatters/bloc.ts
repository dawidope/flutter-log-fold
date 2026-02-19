import { BlockFormatter } from './registry';

export const blocFormatters: Record<string, BlockFormatter> = {
  'bloc-transition': (lines) => {
    // Lines[0]: [bloc-transition] | HH:MM:SS ... |
    // Lines[1]: SomeCubit changed
    // Lines[2]: CURRENT state: OldState
    // Lines[3]: NEXT state: NewState
    if (lines.length < 4) { return null; }
    const nameMatch = lines[1]?.trim().match(/^(.+?)\s+changed$/);
    const currentMatch = lines[2]?.trim().match(/^CURRENT state:\s*(.+)$/);
    const nextMatch = lines[3]?.trim().match(/^NEXT state:\s*(.+)$/);
    if (nameMatch && currentMatch && nextMatch) {
      return `[bloc-transition] ${nameMatch[1]} | ${currentMatch[1]} -> ${nextMatch[1]}`;
    }
    return null;
  },

  'bloc-create': (lines) => {
    // Lines[0]: [bloc-create] | HH:MM:SS ... |
    // Lines[1]: SomeCubit created
    if (lines.length < 2) { return null; }
    const name = lines[1]?.trim().replace(/\s+created$/, '');
    return name ? `[bloc-create] ${name}` : null;
  },

  'bloc-close': (lines) => {
    // Lines[0]: [bloc-close] | HH:MM:SS ... |
    // Lines[1]: SomeCubit closed
    if (lines.length < 2) { return null; }
    const name = lines[1]?.trim().replace(/\s+closed$/, '');
    return name ? `[bloc-close] ${name}` : null;
  },
};
