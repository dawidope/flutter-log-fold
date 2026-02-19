export type BlockFormatter = (cleanLines: string[]) => string | null;

export class FormatterRegistry {
  private formatters = new Map<string, BlockFormatter>();
  private fallback: BlockFormatter | null = null;

  register(group: Record<string, BlockFormatter>): void {
    for (const [tag, fn] of Object.entries(group)) {
      this.formatters.set(tag, fn);
    }
  }

  unregister(group: Record<string, BlockFormatter>): void {
    for (const tag of Object.keys(group)) {
      this.formatters.delete(tag);
    }
  }

  setFallback(fn: BlockFormatter | null): void {
    this.fallback = fn;
  }

  format(tag: string, cleanLines: string[]): string | null {
    const fn = this.formatters.get(tag);
    if (fn) { return fn(cleanLines); }
    return this.fallback ? this.fallback(cleanLines) : null;
  }
}
