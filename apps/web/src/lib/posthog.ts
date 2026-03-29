import posthog from "posthog-js";

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

const posthogKey = import.meta.env.VITE_POSTHOG_KEY?.trim();
const posthogHost = import.meta.env.VITE_POSTHOG_HOST?.trim() || DEFAULT_POSTHOG_HOST;

let initialized = false;

export function initPostHog(): void {
  if (initialized || !posthogKey || typeof window === "undefined") {
    return;
  }

  posthog.init(posthogKey, {
    api_host: posthogHost,
    defaults: "2026-01-30",
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: true,
  });

  initialized = true;
}

export function isPostHogEnabled(): boolean {
  return Boolean(posthogKey);
}

export function identifyActor(handle: string): void {
  if (!posthogKey) {
    return;
  }

  const normalizedHandle = handle.trim();

  if (!normalizedHandle) {
    return;
  }

  posthog.identify(normalizedHandle, {
    handle: normalizedHandle,
  });
}

export function captureClientEvent(
  event: string,
  properties: Record<string, unknown> = {},
): void {
  if (!posthogKey) {
    return;
  }

  posthog.capture(event, properties);
}
