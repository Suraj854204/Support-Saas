import type { UserRole } from "@support-saas/shared-types";
import jwt, { type SignOptions } from "jsonwebtoken";

import { env } from "@/config/env";

export interface AccessTokenPayload {
  sub: string; // user id
  orgId: string;
  role: UserRole;
  type: "access";
}

export interface RefreshTokenPayload {
  sub: string;
  orgId: string;
  tokenId: string; // unique id per refresh token, used for revocation lookups in Redis
  type: "refresh";
}

export function signAccessToken(payload: Omit<AccessTokenPayload, "type">): string {
  return jwt.sign({ ...payload, type: "access" }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
  } as SignOptions);
}

export function signRefreshToken(payload: Omit<RefreshTokenPayload, "type">): string {
  return jwt.sign({ ...payload, type: "refresh" }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
  if (decoded.type !== "access") throw new Error("Invalid token type");
  return decoded;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
  if (decoded.type !== "refresh") throw new Error("Invalid token type");
  return decoded;
}

export interface WidgetTokenPayload {
  sub: string; // customer id
  orgId: string;
  type: "widget";
}

export function signWidgetToken(payload: Omit<WidgetTokenPayload, "type">): string {
  return jwt.sign({ ...payload, type: "widget" }, env.WIDGET_JWT_SECRET, {
    expiresIn: env.WIDGET_JWT_TTL,
  } as SignOptions);
}

export function verifyWidgetToken(token: string): WidgetTokenPayload {
  const decoded = jwt.verify(token, env.WIDGET_JWT_SECRET) as WidgetTokenPayload;
  if (decoded.type !== "widget") throw new Error("Invalid token type");
  return decoded;
}
