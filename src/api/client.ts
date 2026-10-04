import { BASE_URL, BASIC_AUTH, REQUEST_ORIGIN, REQUEST_TIMEOUT_MS } from '../config';

export class ApiError extends Error {
  constructor(message: string, readonly status: number | null) {
    super(message);
    this.name = 'ApiError';
  }
}

type Query = Record<string, string | number | boolean | readonly (string | number)[] | undefined>;

interface RequestOptions {
  query?: Query;
  body?: unknown;
  headers?: Record<string, string>;
}

const buildUrl = (path: string, query?: Query): string => {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const v of values) parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return `${BASE_URL}${path}${parts.length ? `?${parts.join('&')}` : ''}`;
};

// The backend reports errors as { error: { message } } (the web reads error.data.error.message).
const errorMessageOf = (payload: unknown, fallback: string): string => {
  const message = (payload as { error?: { message?: unknown } } | null)?.error?.message;
  return typeof message === 'string' && message.trim() ? message : fallback;
};

const parseBody = (text: string): unknown => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

// Every REST call carries the same headers as the web dashboard. The JWT is NOT sent here:
// the backend authenticates vendor REST calls with the shared Basic credential.
export const request = async <T>(method: 'GET' | 'POST' | 'PATCH', path: string, opts: RequestOptions = {}): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(buildUrl(path, opts.query), {
      method,
      headers: {
        Authorization: BASIC_AUTH,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Request-Origin': REQUEST_ORIGIN,
        ...opts.headers,
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
    });
    const payload = parseBody(await res.text());
    if (!res.ok) throw new ApiError(errorMessageOf(payload, `Server error (${res.status})`), res.status);
    return payload as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    const aborted = (e as { name?: string } | null)?.name === 'AbortError';
    throw new ApiError(aborted ? 'Server took too long to answer' : 'No connection to the server', null);
  } finally {
    clearTimeout(timer);
  }
};
