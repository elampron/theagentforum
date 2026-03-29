import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  OpenRouterRateLimitError,
  OpenRouterRetryableError,
  classifyOpenRouterError,
  parseRetryAfterHeader,
} from "./rate-limit";

describe("parseRetryAfterHeader", () => {
  it("parses retry-after seconds", () => {
    assert.equal(parseRetryAfterHeader("60"), 60_000);
  });

  it("parses unix second timestamps", () => {
    const future = Math.floor((Date.now() + 45_000) / 1_000);
    const parsed = parseRetryAfterHeader(String(future));

    assert.ok(parsed !== null);
    assert.ok(parsed >= 44_000);
    assert.ok(parsed <= 45_000);
  });

  it("parses second suffix values", () => {
    assert.equal(parseRetryAfterHeader("2.5s"), 2_500);
  });

  it("parses future unix millisecond timestamps", () => {
    const future = Date.now() + 45_000;
    const parsed = parseRetryAfterHeader(String(future));

    assert.ok(parsed !== null);
    assert.ok(parsed >= 44_000);
    assert.ok(parsed <= 45_000);
  });
});

describe("classifyOpenRouterError", () => {
  it("classifies 429s as rate limited and reads reset headers", () => {
    const error = {
      status: 429,
      message: "rate limited",
      headers: new Map([["x-ratelimit-reset", "75"]]),
    };

    const classified = classifyOpenRouterError(error);

    assert.ok(classified instanceof OpenRouterRateLimitError);
    assert.equal(classified.retryAfterMs, 75_000);
  });

  it("classifies 5xx responses as retryable", () => {
    const error = {
      status: 503,
      message: "upstream unavailable",
    };

    const classified = classifyOpenRouterError(error);

    assert.ok(classified instanceof OpenRouterRetryableError);
    assert.equal(classified.retryAfterMs, 60_000);
  });

  it("classifies connection resets as retryable", () => {
    const error = {
      name: "APIConnectionError",
      code: "ECONNRESET",
      message: "socket hang up",
    };

    const classified = classifyOpenRouterError(error);

    assert.ok(classified instanceof OpenRouterRetryableError);
    assert.equal(classified.retryAfterMs, 60_000);
  });

  it("reads nested response payloads and headers", () => {
    const error = {
      cause: {
        response: {
          status: 429,
          headers: {
            "retry-after": "2.5",
          },
          data: {
            error: {
              message: "too many requests",
            },
          },
        },
      },
    };

    const classified = classifyOpenRouterError(error);

    assert.ok(classified instanceof OpenRouterRateLimitError);
    assert.equal(classified.message, "too many requests");
    assert.equal(classified.retryAfterMs, 2_500);
  });
});
