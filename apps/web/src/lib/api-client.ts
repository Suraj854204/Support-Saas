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

/** Turns an API-relative link (e.g. a signed file URL) into an absolute one. */
export const apiUrl = (path: string) => (path.startsWith("/") ? `${API_URL}${path}` : path);

export const apiClient = {
  /** Multipart upload (files). The browser sets the multipart boundary itself. */
  postForm: async <T>(path: string, form: FormData): Promise<T> => {
    const token = getToken();
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
    if (!res.ok || !json || !json.success) {
      const error = json && !json.success ? json.error : null;
      throw new ApiRequestError(error?.code ?? "INTERNAL_ERROR", error?.message ?? `Upload failed with status ${res.status}`, res.status, error?.details);
    }
    return json.data;
  },
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: "GET" }),
  getPaginated: <T>(path: string, options?: RequestOptions) =>
    requestWithMeta<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PATCH", body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PUT", body }),
  /** Sends a raw text body (e.g. CSV) instead of JSON; the response is still the standard JSON envelope. */
  postText: async <T>(path: string, text: string, contentType = "text/csv"): Promise<T> => {
    const token = getToken();
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": contentType, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: text,
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
  },
  delete: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: "DELETE" }),
  /**
   * For binary responses (attachment downloads) — bypasses the JSON
   * envelope parsing every other method uses, but reuses the same token
   * getter so authenticated downloads work identically to any other call.
   */
  downloadBlob: async (path: string): Promise<Blob> => {
    const token = getToken();
    const res = await fetch(`${API_URL}${path}`, {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new ApiRequestError("DOWNLOAD_FAILED", `Download failed with status ${res.status}`, res.status);
    return res.blob();
  },
};
