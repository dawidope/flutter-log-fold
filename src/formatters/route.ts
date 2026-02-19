import { BlockFormatter } from './registry';

export const routeFormatters: Record<string, BlockFormatter> = {
  'route': (lines) => {
    // Lines[0]: [route] | HH:MM:SS ... | Open route named story_preview
    if (lines.length < 1) { return null; }
    const header = lines[0].trim();
    // Extract message after the last ` | `
    const lastPipe = header.lastIndexOf(' | ');
    if (lastPipe === -1) { return null; }
    const message = header.substring(lastPipe + 3).trim();
    return message ? `[route] ${message}` : null;
  },
};
