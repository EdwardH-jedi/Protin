/**
 * Safety API helpers (V1.1).
 *
 * Reports are submitted via the existing ReportScreen which calls
 * `api.post('/reports', ...)` inline. This module is intentionally
 * narrow — it exposes the block endpoint so screens that need to
 * trigger a block can do so without inlining a fetch.
 */

import { api } from './api';

interface BlockResponse {
  id: string;
  blockerId: string;
  blockedId: string;
  createdAt: string;
}

/**
 * Block a user. Backend route is `POST /blocks/{blockedUserId}` and
 * is idempotent: repeated calls return the existing block.
 */
export async function blockUser(blockedUserId: string): Promise<BlockResponse> {
  return api.post<BlockResponse>(`/blocks/${blockedUserId}`);
}
