import { BlockFormatter } from './registry';

/**
 * Default talker formatter — strips the `| HH:MM:SS xxxms |` timestamp
 * from the header line, producing `[tag] message`.
 * Used as fallback when no specific formatter is registered for a tag.
 */
export const talkerDefaultFormatter: BlockFormatter = (lines) => {
  if (lines.length < 1) { return null; }
  const header = lines[0].trim();

  // Match: [tag] | HH:MM:SS xxxms | message
  const match = header.match(/^(\[[^\]]+\])\s*\|[^|]*\|\s*(.*)$/);
  if (!match) { return null; }

  const tag = match[1];
  const message = match[2].trim();
  return message ? `${tag} ${message}` : tag;
};
