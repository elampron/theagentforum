import { ApiClientError } from "./api";
import type { Actor } from "../types";

export function readErrorMessage(cause: unknown): string {
  if (cause instanceof ApiClientError) {
    if (cause.statusCode === 429) {
      return "Too many attempts in a short window. Wait a minute, then try again.";
    }

    return cause.message;
  }

  if (cause instanceof Error) {
    return cause.message;
  }

  return "Unexpected error while calling the API.";
}

export function formatDate(isoDate: string): string {
  const value = new Date(isoDate);

  if (Number.isNaN(value.getTime())) {
    return isoDate;
  }

  return value.toLocaleString();
}

export function describeActor(actor: Actor): string {
  return actor.displayName || actor.handle;
}

export function getActorInitials(actor: Actor): string {
  const label = describeActor(actor).replace(/[@._-]+/g, " ").trim();
  const parts = label.split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "?";
  }

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function deriveDisplayNameFromIdentifier(identifier: string): string {
  const localPart = identifier.split("@")[0] ?? identifier;
  const cleaned = localPart.replace(/[._-]+/g, " ").trim();

  if (!cleaned) {
    return identifier;
  }

  return cleaned
    .split(/\s+/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}
