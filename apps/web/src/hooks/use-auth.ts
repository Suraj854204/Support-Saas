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

export function useCurrentUser() {
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiClient.get<User>("/api/auth/me"),
    enabled: Boolean(accessToken),
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogin() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: LoginInput) =>
      apiClient.post<{ user: User; accessToken: string }>("/api/auth/login", input, { skipAuth: true }),
    onSuccess: (data) => {
      dispatch(setCredentials(data));
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      router.push("/dashboard");
    },
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
