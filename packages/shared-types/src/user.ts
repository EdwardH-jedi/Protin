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
// Entity
// ---------------------------------------------------------------------------

/**
 * Authentication identity as returned by GET /auth/me.
 * Fields match the API's UserResponse schema (snake_case keys transformed to camelCase
 * by the mobile API client layer).
 *
 * Note: the API uses `is_active: bool` (boolean), not a string status field.
 * A UserStatus string union is not part of the current API contract.
 */
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

/**
 * Request body for POST /auth/apple.
 * `identityToken` is the JWT issued by Apple on the client; the API verifies
 * it against Apple's public keys. `email` and `name` are only provided by
 * Apple on the very first sign-in and should be forwarded when present.
 */
export interface AppleSignInRequest {
  identityToken: string;
  nonce?: string;
  email?: string | null;
  name?: string | null;
  // One-time authorization code from Apple. Forwarded so the API can exchange
  // it for a refresh token and revoke it on account deletion (App Store
  // 5.1.1(v)). Optional: older clients / cancelled flows may omit it.
  authorizationCode?: string | null;
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
