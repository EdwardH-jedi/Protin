/**
 * Pure helpers for chat message lists.
 *
 * Centralized so every code path that mutates the message array
 * (initial fetch, optimistic POST result, WebSocket frame, retry) goes
 * through the same dedup logic. Without this, a race between the POST
 * response and the WS broadcast of the same message id can produce two
 * children with the same React key — the iPhone-real-device warning we
 * saw before this fix.
 */

interface IdLike {
  id: string;
}

/**
 * Return a new array with duplicates by `id` removed, keeping the first
 * occurrence of each id and preserving the original order.
 *
 * Order matters here: the server returns messages oldest-first, sendMessage
 * appends at the tail, and the WS handler also appends at the tail. Keeping
 * the FIRST occurrence preserves the chronological order the user already
 * sees on screen even when a duplicate frame arrives later.
 */
export function dedupeMessagesById<T extends IdLike>(messages: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const m of messages) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}
