import { ApiClientError } from "./api";

export function readErrorMessage(cause: unknown): string {
  if (cause instanceof ApiClientError) {
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
