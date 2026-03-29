import { PostHog } from "posthog-node";

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";
const MAX_PROPERTY_TEXT_LENGTH = 8_000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5_000;

let client: PostHog | null | undefined;

export function getPostHogClient(): PostHog | null {
  if (client !== undefined) {
    return client;
  }

  const apiKey = process.env.POSTHOG_API_KEY?.trim();

  if (!apiKey) {
    client = null;
    return client;
  }

  client = new PostHog(apiKey, {
    host: process.env.POSTHOG_HOST?.trim() || DEFAULT_POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
  });

  return client;
}

export async function shutdownPostHog(timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS): Promise<void> {
  if (!client) {
    return;
  }

  try {
    await client._shutdown(timeoutMs);
  } catch (error) {
    console.error("PostHog shutdown failed:", error);
  } finally {
    client = null;
  }
}

export function captureServerEvent(
  event: string,
  distinctId: string,
  properties: Record<string, unknown> = {},
): void {
  const posthog = getPostHogClient();

  if (!posthog) {
    return;
  }

  try {
    posthog.capture({
      event,
      distinctId,
      properties: sanitizeProperties(properties),
    });
  } catch (error) {
    console.error(`PostHog capture failed for ${event}:`, error);
  }
}

function sanitizeProperties(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, sanitizeValue(entry)]),
  );
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > MAX_PROPERTY_TEXT_LENGTH
      ? `${value.slice(0, MAX_PROPERTY_TEXT_LENGTH)}…`
      : value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry));
  }

  if (value && typeof value === "object") {
    return sanitizeProperties(value as Record<string, unknown>);
  }

  return value;
}
