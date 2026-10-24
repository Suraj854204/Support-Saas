import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { apiClient } from "@/lib/api-client";
import { useAppDispatch, useAppSelector } from "@/store";
import { clearCredentials, setCredentials } from "@/store/slices/auth-slice";
import type { Organization, User } from "@support-saas/shared-types";

interface LoginInput {
  email: string;
  password: string;
}

interface RegisterInput {
  orgName: string;
  name: string;
  email: string;
  password: string;
}

type LoginResponse =
  | { requiresOtp: true; challengeId: string; maskedEmail: string; expiresInSeconds: number }
  | { requiresOtp: false; user: User; accessToken: string };

export interface UserSession {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
}

export function useCurrentUser() {
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiClient.get<User>("/api/auth/me"),
    enabled: Boolean(accessToken),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Step 1 of login. Resolves with either an OTP challenge (the common case)
 * or, if the browser carries a valid trusted-device cookie, fully-issued
 * credentials — never both.
 */
export function useLogin() {
  return useMutation({
    mutationFn: (input: LoginInput) =>
      apiClient.post<LoginResponse>("/api/auth/login", input, { skipAuth: true }),
  });
}

/** Step 2 of login: submits the 6-digit code from the emailed OTP challenge. */
export function useVerifyLoginOtp() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { challengeId: string; otp: string; rememberDevice?: boolean }) =>
      apiClient.post<{ user: User; accessToken: string }>("/api/auth/verify-login-otp", input, {
        skipAuth: true,
      }),
    onSuccess: (data) => {
      dispatch(setCredentials(data));
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      router.push("/dashboard");
    },
  });
}

export function useResendLoginOtp() {
  return useMutation({
    mutationFn: (input: { challengeId: string }) =>
      apiClient.post<{ challengeId: string; maskedEmail: string; expiresInSeconds: number }>(
        "/api/auth/resend-login-otp",
        input,
        { skipAuth: true }
      ),
  });
}

export function useRegister() {
  const dispatch = useAppDispatch();
  const router = useRouter();

  return useMutation({
    mutationFn: (input: RegisterInput) =>
      apiClient.post<{ user: User; org: Organization; accessToken: string }>("/api/auth/register", input, {
        skipAuth: true,
      }),
    onSuccess: (data) => {
      dispatch(setCredentials(data));
      router.push("/dashboard");
    },
  });
}

export function useLogout() {
  const dispatch = useAppDispatch();
  const router = useRouter();

  return useMutation({
    mutationFn: () => apiClient.post("/api/auth/logout"),
    onSettled: () => {
      dispatch(clearCredentials());
      router.push("/login");
    },
  });
}

/** Signs out every device/session for the current user, including this one. */
export function useLogoutAllDevices() {
  const dispatch = useAppDispatch();
  const router = useRouter();

  return useMutation({
    mutationFn: () => apiClient.post("/api/auth/logout-all"),
    onSettled: () => {
      dispatch(clearCredentials());
      router.push("/login");
    },
  });
}

export function useSessions() {
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  return useQuery({
    queryKey: ["auth", "sessions"],
    queryFn: () => apiClient.get<UserSession[]>("/api/auth/sessions"),
    enabled: Boolean(accessToken),
  });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => apiClient.delete(`/api/auth/sessions/${sessionId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth", "sessions"] }),
  });
}

export function useSendVerificationEmail() {
  return useMutation({
    mutationFn: (email?: string) => apiClient.post<{ sent: true }>("/api/auth/send-verification", { email }),
  });
}

export function useVerifyEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      apiClient.post<{ verified: true }>("/api/auth/verify-email", { token }, { skipAuth: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth", "me"] }),
  });
}
