/**
 * User domain types.
 *
 * A User is the authentication identity record. It holds only auth-level
 * fields. Display and fitness data lives in UserProfile and SportProfile
 * (sport-profile.ts).
 *
 * Note: there is no UserRole — Protin has no trainer/client distinction.
 * All users are workout seekers.
 */

import type { ISODateString, UUID } from './common';

// ---------------------------------------------------------------------------
// Enums (string unions)
// ---------------------------------------------------------------------------

export type UserStatus = 'active' | 'pending_verification' | 'suspended';

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface User {
  id: UUID;
  email: string;
  isActive: boolean;
  createdAt: ISODateString;
}

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

export interface RegisterRequest {
  email: string;
  password: string;  // min 8 chars enforced by API
}

export interface LoginRequest {
  email: string;
  password: string;
}

// ---------------------------------------------------------------------------
// Response bodies
// ---------------------------------------------------------------------------

/**
 * Returned by POST /auth/register and POST /auth/login.
 * Store `accessToken` in secure storage; attach as `Authorization: Bearer <token>`.
 */
export interface TokenResponse {
  accessToken: string;
  tokenType: 'bearer';
}

/**
 * Returned by GET /auth/me.
 * Safe to expose; does not include password or internal fields.
 */
export type MeResponse = User;
