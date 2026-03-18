/**
 * Safety types — reports and blocks.
 *
 * Report: POST /reports
 * Block:  POST /blocks/{userId}
 *         DELETE /blocks/{userId}
 *         GET /blocks
 */

import type { ISODateString, UUID } from './common';

export type ReportReason =
  | 'spam'
  | 'inappropriate'
  | 'fake'
  | 'harassment'
  | 'other';

export interface CreateReportRequest {
  reportedUserId: UUID;
  reason: ReportReason;
  context?: string;
}

export interface ReportResponse {
  id: UUID;
  reporterId: UUID;
  reportedId: UUID;
  reason: ReportReason;
  context?: string;
  createdAt: ISODateString;
}

export interface BlockResponse {
  id: UUID;
  blockerId: UUID;
  blockedId: UUID;
  createdAt: ISODateString;
}

export interface BlockListResponse {
  items: BlockResponse[];
  total: number;
}
