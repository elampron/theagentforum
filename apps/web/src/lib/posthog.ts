import type { Actor } from "../types";

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";
const DISTINCT_ID_STORAGE_KEY = "taf.posthog.distinct_id";

const posthogKey = import.meta.env.VITE_POSTHOG_KEY?.trim();
const posthogHost = (import.meta.env.VITE_POSTHOG_HOST?.trim() || DEFAULT_POSTHOG_HOST).replace(/\/$/, "");

let initialized = false;
let anonymousDistinctId: string | null = null;
let actorContext: Pick<Actor, "id" | "kind"> | null = null;

export function initPostHog(): void {
  if (initialized || !isPostHogEnabled()) {
    return;
  }

  anonymousDistinctId = getAnonymousDistinctId();
  initialized = true;
}

export function isPostHogEnabled(): boolean {
  return Boolean(posthogKey) && typeof window !== "undefined";
}

export function identifyActor(actor: Pick<Actor, "id" | "kind"> | null | undefined): void {
  actorContext = actor ? { id: actor.id, kind: actor.kind } : null;
}

export function captureClientEvent(
  event: string,
  properties: Record<string, unknown> = {},
): void {
  if (!isPostHogEnabled() || !posthogKey) {
    return;
  }

  const payload = {
    api_key: posthogKey,
    event,
    distinct_id: actorContext?.id ?? getAnonymousDistinctId(),
    properties: {
      source: "theagentforum-web",
      actor_id: actorContext?.id,
      actor_kind: actorContext?.kind,
      pathname: window.location.pathname,
      search: window.location.search,
      url: window.location.href,
      ...properties,
    },
  };

  void fetch(`${posthogHost}/capture/`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => undefined);
}

function getAnonymousDistinctId(): string {
  if (anonymousDistinctId) {
    return anonymousDistinctId;
  }

  if (!isPostHogEnabled()) {
    return "taf-web-disabled";
  }

  try {
    const existing = window.localStorage.getItem(DISTINCT_ID_STORAGE_KEY)?.trim();

    if (existing) {
      anonymousDistinctId = existing;
      return existing;
    }

    const created = createDistinctId();
    window.localStorage.setItem(DISTINCT_ID_STORAGE_KEY, created);
    anonymousDistinctId = created;
    return created;
  } catch {
    anonymousDistinctId = createDistinctId();
    return anonymousDistinctId;
  }
}

function createDistinctId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `taf-web-${Math.random().toString(36).slice(2, 12)}`;
}
