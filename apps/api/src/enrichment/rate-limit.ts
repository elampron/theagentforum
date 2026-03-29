const DEFAULT_RATE_LIMIT_DELAY_MS = 60_000;
const MAX_RATE_LIMIT_DELAY_MS = 15 * 60_000;
const NETWORK_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
]);
const NETWORK_ERROR_NAMES = new Set([
  "APIConnectionError",
  "APIConnectionTimeoutError",
  "FetchError",
]);

interface HeaderLookup {
  get(name: string): string | null | undefined;
}

export class OpenRouterRateLimitError extends Error {
  readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = "OpenRouterRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export class OpenRouterRetryableError extends Error {
  readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = "OpenRouterRetryableError";
    this.retryAfterMs = retryAfterMs;
  }
}

export function classifyOpenRouterError(error: unknown): Error {
  const status = getErrorStatus(error);
  const message = getErrorMessage(error);
  const retryAfterMs = getRetryAfterMs(error);

  if (status === 429) {
    return new OpenRouterRateLimitError(message, retryAfterMs ?? DEFAULT_RATE_LIMIT_DELAY_MS);
  }

  if (status === 408 || status === 409 || status === 425 || (status !== null && status >= 500)) {
    return new OpenRouterRetryableError(message, retryAfterMs ?? DEFAULT_RATE_LIMIT_DELAY_MS);
  }

  if (isRetryableNetworkError(error)) {
    return new OpenRouterRetryableError(message, retryAfterMs ?? DEFAULT_RATE_LIMIT_DELAY_MS);
  }

  return error instanceof Error ? error : new Error(message);
}

export function getRetryAfterMs(error: unknown): number | null {
  const headers = getErrorHeaders(error);

  if (!headers) {
    return null;
  }

  for (const name of ["retry-after-ms", "retry-after", "x-ratelimit-reset", "ratelimit-reset"]) {
    const rawValue = readHeader(headers, name);
    const parsed = parseRetryAfterHeader(rawValue);

    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

export function parseRetryAfterHeader(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed);

    if (!Number.isFinite(numeric) || numeric <= 0) {
      return null;
    }

    let scaled: number;

    if (numeric >= 1_000_000_000_000) {
      scaled = numeric - Date.now();
    } else if (numeric >= 1_000_000_000) {
      scaled = numeric * 1_000 - Date.now();
    } else {
      scaled = numeric * 1_000;
    }

    return clampDelay(scaled);
  }

  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return clampDelay(Number(trimmed) * 1_000);
  }

  const secondsMatch = trimmed.match(/^(\d+(?:\.\d+)?)s$/i);

  if (secondsMatch) {
    return clampDelay(Number(secondsMatch[1]) * 1_000);
  }

  const dateMs = Date.parse(trimmed);

  if (!Number.isNaN(dateMs)) {
    return clampDelay(dateMs - Date.now());
  }

  return null;
}

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const directStatus = (error as { status?: unknown }).status;

  if (typeof directStatus === "number") {
    return directStatus;
  }

  const directStatusCode = (error as { statusCode?: unknown }).statusCode;

  if (typeof directStatusCode === "number") {
    return directStatusCode;
  }

  const nestedErrorStatus = (error as { error?: { status?: unknown; statusCode?: unknown } }).error;

  if (typeof nestedErrorStatus?.status === "number") {
    return nestedErrorStatus.status;
  }

  if (typeof nestedErrorStatus?.statusCode === "number") {
    return nestedErrorStatus.statusCode;
  }

  const responseStatus = (error as { response?: { status?: unknown } }).response?.status;

  if (typeof responseStatus === "number") {
    return responseStatus;
  }

  const cause = (error as { cause?: unknown }).cause;
  return cause && cause !== error ? getErrorStatus(cause) : null;
}

function getErrorHeaders(error: unknown): HeaderLookup | Map<string, string> | Record<string, unknown> | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const directHeaders = (error as { headers?: unknown }).headers;

  if (isHeaderLookup(directHeaders) || directHeaders instanceof Map || isRecord(directHeaders)) {
    return directHeaders;
  }

  const responseHeaders = (error as { response?: { headers?: unknown } }).response?.headers;

  if (isHeaderLookup(responseHeaders) || responseHeaders instanceof Map || isRecord(responseHeaders)) {
    return responseHeaders;
  }

  const nestedErrorHeaders = (error as { error?: { headers?: unknown } }).error?.headers;

  if (isHeaderLookup(nestedErrorHeaders) || nestedErrorHeaders instanceof Map || isRecord(nestedErrorHeaders)) {
    return nestedErrorHeaders;
  }

  const cause = (error as { cause?: unknown }).cause;

  if (cause && cause !== error) {
    return getErrorHeaders(cause);
  }

  return null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const payloadMessage = (error as { error?: { message?: unknown } }).error?.message;

    if (typeof payloadMessage === "string" && payloadMessage.trim()) {
      return payloadMessage;
    }

    const responsePayloadMessage = (
      error as { response?: { data?: { error?: { message?: unknown }; message?: unknown } } }
    ).response?.data;

    if (typeof responsePayloadMessage?.error?.message === "string" && responsePayloadMessage.error.message.trim()) {
      return responsePayloadMessage.error.message;
    }

    if (typeof responsePayloadMessage?.message === "string" && responsePayloadMessage.message.trim()) {
      return responsePayloadMessage.message;
    }

    const cause = (error as { cause?: unknown }).cause;

    if (cause && cause !== error) {
      return getErrorMessage(cause);
    }
  }

  return String(error);
}

function isRetryableNetworkError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = (error as { code?: unknown }).code;

  if (typeof code === "string" && NETWORK_ERROR_CODES.has(code)) {
    return true;
  }

  const name = (error as { name?: unknown }).name;

  if (typeof name === "string" && NETWORK_ERROR_NAMES.has(name)) {
    return true;
  }

  const cause = (error as { cause?: unknown }).cause;
  return Boolean(cause && cause !== error && isRetryableNetworkError(cause));
}

function readHeader(headers: HeaderLookup | Map<string, string> | Record<string, unknown>, name: string): string | null {
  if (headers instanceof Map) {
    return headers.get(name) ?? headers.get(name.toLowerCase()) ?? null;
  }

  if (isHeaderLookup(headers)) {
    return headers.get(name) ?? headers.get(name.toLowerCase()) ?? null;
  }

  const exact = headers[name];
  const lower = headers[name.toLowerCase()];
  const value = exact ?? lower;
  return typeof value === "string" ? value : null;
}

function clampDelay(delayMs: number): number {
  if (!Number.isFinite(delayMs)) {
    return DEFAULT_RATE_LIMIT_DELAY_MS;
  }

  const rounded = Math.ceil(delayMs);
  return Math.min(Math.max(rounded, 1_000), MAX_RATE_LIMIT_DELAY_MS);
}

function isHeaderLookup(value: unknown): value is HeaderLookup {
  return Boolean(value) && typeof value === "object" && typeof (value as HeaderLookup).get === "function";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
