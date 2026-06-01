from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class AppleSignInRequest(BaseModel):
    # Raw identity JWT returned by Apple (ASAuthorizationAppleIDCredential.identityToken)
    identity_token: str
    # Raw nonce passed to Apple on the client; if provided, server re-checks it
    nonce: str | None = None
    # Apple only returns email/name on the FIRST sign-in. Client must forward
    # them as-is so we can persist them before they are lost forever.
    email: EmailStr | None = None
    name: str | None = Field(default=None, max_length=120)
    # One-time native authorization code. When provided (and Apple revocation is
    # configured), the server exchanges it for a refresh token and stores it so
    # account deletion can revoke the user's Apple tokens (App Store 5.1.1(v)).
    authorization_code: str | None = None


class UserResponse(BaseModel):
    id: UUID
    email: str
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
