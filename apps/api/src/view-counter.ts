import { createHmac } from 'node:crypto';

/**
 * Decides whether a public page view should be counted: once per visitor per project per window.
 * Visitors are keyed by a keyed hash of their address, held only in memory, so no raw IP is kept
 * and nothing about visitors is written to disk. A restart resets the window, which only means a
 * returning visitor may be counted once more — acceptable for a display-only number.
 */
export class ViewCounter {
  private seen = new Map<string, number>();
  constructor(
    private secret: string,
    private windowMs = 24 * 3600 * 1000,
    private capacity = 100000,
  ) {}
  shouldCount(projectId: string, visitor: string): boolean {
    const now = Date.now();
    // All entries share one window, so insertion order is expiry order.
    for (const [key, until] of this.seen) {
      if (until > now) break;
      this.seen.delete(key);
    }
    const key = createHmac('sha256', this.secret)
      .update(`view\n${projectId}\n${visitor}`)
      .digest('base64url');
    if (this.seen.has(key)) return false;
    while (this.seen.size >= this.capacity) {
      const oldest = this.seen.keys().next();
      if (oldest.done) break;
      this.seen.delete(oldest.value);
    }
    this.seen.set(key, now + this.windowMs);
    return true;
  }
  clear() {
    this.seen.clear();
  }
}
