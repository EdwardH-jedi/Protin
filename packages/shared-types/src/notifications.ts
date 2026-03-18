/**
 * Push notification types.
 *
 * Token registration:
 *   POST /notifications/token → PushTokenResponse
 *   DELETE /notifications/token/{id}
 *
 * Notification events are server-scheduled; the mobile side only
 * needs to register a token and handle incoming push payloads.
 */

import type { ISODateString, UUID } from './common';

export type PushPlatform = 'ios' | 'android' | 'web';

export type NotificationType =
  | 'proposal_received'
  | 'booking_confirmed'
  | 'booking_declined'
  | 'booking_cancelled'
  | 'reminder';

export interface RegisterPushTokenRequest {
  token: string;
  platform: PushPlatform;
}

export interface PushTokenResponse {
  id: UUID;
  userId: UUID;
  token: string;
  platform: PushPlatform;
  createdAt: ISODateString;
}

/** Payload included in push notification data field. */
export interface PushNotificationData {
  type: NotificationType;
  bookingId?: UUID;
}
