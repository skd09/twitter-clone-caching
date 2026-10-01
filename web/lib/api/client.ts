/**
 * Transport layer for every call to the Laravel backend.
 *
 * Nothing above this file should touch `fetch`, know the base URL, or invent its
 * own error shape. Callers get an ApiResult and branch on `error.kind`.
 */

export type ApiErrorKind =
  /** Request never completed: DNS, connection refused, CORS. */
  | 'network'
  /** Client-side deadline elapsed. */
  | 'timeout'
  /** Completed with a non-2xx status. */
  | 'http'
  /** 409: the write was rejected because it already happened. */
  | 'conflict'
  /** 2xx whose body would not parse as JSON. */
  | 'parse'
  /** 2xx, valid JSON, but the payload violates the endpoint's contract. */
  | 'corrupt';

export type ApiError = {
  kind: ApiErrorKind;
  message: string;
  /** Present when kind === 'http'. */
  status?: number;
};

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000';

const DEFAULT_TIMEOUT_MS = 8000;

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export function apiError(kind: ApiErrorKind, message: string, status?: number): ApiError {
  return status === undefined ? { kind, message } : { kind, message, status };
}

export async function request<T>(
  path: string,
  options: RequestOptions = {}
): Promise<ApiResult<T>> {
  const { method = 'GET', body, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  // Built from AbortController rather than AbortSignal.any/timeout, which are
  // still too new to assume across every browser this gets opened in.
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const relay = () => controller.abort();
  signal?.addEventListener('abort', relay);

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    if (!res.ok) {
      // Laravel reports these as {"error": "..."}; prefer that over a bare status.
      let detail = `${method} ${path} responded ${res.status}`;
      try {
        const problem = (await res.json()) as { error?: unknown; message?: unknown };
        const stated = problem.error ?? problem.message;
        if (typeof stated === 'string' && stated.length > 0) detail = stated;
      } catch {
        // Non-JSON error body: the status line is all we have.
      }

      return {
        ok: false,
        error: apiError(res.status === 409 ? 'conflict' : 'http', detail, res.status),
      };
    }

    try {
      return { ok: true, data: (await res.json()) as T };
    } catch {
      return { ok: false, error: apiError('parse', `${method} ${path} returned invalid JSON`) };
    }
  } catch (err) {
    if (timedOut) {
      return { ok: false, error: apiError('timeout', `${method} ${path} timed out after ${timeoutMs}ms`) };
    }
    if (signal?.aborted) {
      return { ok: false, error: apiError('network', `${method} ${path} was cancelled`) };
    }
    return {
      ok: false,
      error: apiError('network', err instanceof Error ? err.message : 'Could not reach the API'),
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', relay);
  }
}
