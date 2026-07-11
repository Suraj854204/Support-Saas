import type { ApiResponse, PaginationMeta } from "@support-saas/shared-types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiRequestError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

type TokenGetter = () => string | null;

let getToken: TokenGetter = () => null;

/** Wires the API client to the Redux store's access token without a circular import. */
export function registerTokenGetter(fn: TokenGetter) {
  getToken = fn;
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  skipAuth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, skipAuth, headers, ...rest } = options;
  const token = skipAuth ? null : getToken();

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    credentials: "include", // send the httpOnly refresh cookie where relevant
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;

  if (!res.ok || !json || !json.success) {
    const error = json && !json.success ? json.error : null;
    throw new ApiRequestError(
      error?.code ?? "INTERNAL_ERROR",
      error?.message ?? `Request failed with status ${res.status}`,
      res.status,
      error?.details
    );
  }

  return json.data;
}

async function requestWithMeta<T>(
  path: string,
  options: RequestOptions = {}
): Promise<{ data: T; meta?: PaginationMeta }> {
  const { body, skipAuth, headers, ...rest } = options;
  const token = skipAuth ? null : getToken();

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;

  if (!res.ok || !json || !json.success) {
    const error = json && !json.success ? json.error : null;
    throw new ApiRequestError(
      error?.code ?? "INTERNAL_ERROR",
      error?.message ?? `Request failed with status ${res.status}`,
      res.status,
      error?.details
    );
  }

  return { data: json.data, meta: json.success ? json.meta : undefined };
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: "GET" }),
  getPaginated: <T>(path: string, options?: RequestOptions) =>
    requestWithMeta<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PATCH", body }),
  delete: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: "DELETE" }),
};
