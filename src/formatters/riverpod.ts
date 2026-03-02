import { BlockFormatter } from './registry';

export const riverpodFormatters: Record<string, BlockFormatter> = {
  'riverpod-update': (lines) => {
    // Lines[0]: [riverpod-update] | HH:MM:SS ... |
    // Lines[1]: X updated
    // Lines[2]: PREVIOUS state:
    // Lines[3]: prev-value (possibly multi-line — take first line only)
    // ...
    // Lines[N]: NEW state:
    // Lines[N+1]: new-value (possibly multi-line — take first line only)
    if (lines.length < 5) { return null; }
    const nameMatch = lines[1]?.trim().match(/^(.+?)\s+updated$/);
    if (!nameMatch) { return null; }
    const prevLabel = lines[2]?.trim();
    if (prevLabel !== 'PREVIOUS state:') { return null; }
    const prevValue = lines[3]?.trim();
    if (!prevValue) { return null; }
    // Find "NEW state:" line
    let newStateIdx = -1;
    for (let i = 4; i < lines.length; i++) {
      if (lines[i].trim() === 'NEW state:') {
        newStateIdx = i;
        break;
      }
    }
    if (newStateIdx === -1 || newStateIdx + 1 >= lines.length) { return null; }
    const newValue = lines[newStateIdx + 1]?.trim();
    if (!newValue) { return null; }
    return `[riverpod-update] ${nameMatch[1]} | ${prevValue} -> ${newValue}`;
  },

  'riverpod-add': (lines) => {
    // Lines[0]: [riverpod-add] | HH:MM:SS ... |
    // Lines[1]: X initialized
    // Lines[2]: INITIAL state:
    // Lines[3]: state value (possibly multi-line — take first line only)
    if (lines.length < 4) { return null; }
    const nameMatch = lines[1]?.trim().match(/^(.+?)\s+initialized$/);
    if (!nameMatch) { return null; }
    const label = lines[2]?.trim();
    if (label !== 'INITIAL state:') { return null; }
    const stateValue = lines[3]?.trim();
    if (!stateValue) { return null; }
    return `[riverpod-add] ${nameMatch[1]} | ${stateValue}`;
  },

  'riverpod-dispose': (lines) => {
    // Lines[0]: [riverpod-dispose] | HH:MM:SS ... |
    // Lines[1]: X disposed
    if (lines.length < 2) { return null; }
    const name = lines[1]?.trim().replace(/\s+disposed$/, '');
    return name ? `[riverpod-dispose] ${name}` : null;
  },
};
