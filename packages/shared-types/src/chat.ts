/**
 * Chat domain types.
 *
 * Messages are scoped to a match. Both participants can send and receive.
 */

import type { ISODateString, UUID } from './common';

export interface Message {
  id: UUID;
  matchId: UUID;
  senderId: UUID;
  body: string;
  createdAt: ISODateString;
}

export interface SendMessageRequest {
  body: string;
}

export interface MessageListResponse {
  items: Message[];
  total: number;
  limit: number;
  offset: number;
}
