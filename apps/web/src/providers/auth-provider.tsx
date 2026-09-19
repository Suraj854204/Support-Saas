"use client";

import { useEffect } from "react";

import { apiClient, ApiRequestError } from "@/lib/api-client";
import { useAppDispatch, useAppSelector } from "@/store";
import { setAccessToken, setUnauthenticated } from "@/store/slices/auth-slice";

/**
 * On first load there's no access token in memory (a full page refresh wipes
 * Redux state), but the refresh-token httpOnly cookie may still be valid.
 * This silently exchanges it for a fresh access token so the session
 * survives a reload without forcing a re-login.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const status = useAppSelector((s) => s.auth.status);

  useEffect(() => {
    if (status !== "idle") return;

    apiClient
      .post<{ accessToken: string }>("/api/auth/refresh", undefined, { skipAuth: true })
      .then((data) => dispatch(setAccessToken(data.accessToken)))
      .catch((err) => {
        if (err instanceof ApiRequestError) {
          dispatch(setUnauthenticated());
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return <>{children}</>;
}
