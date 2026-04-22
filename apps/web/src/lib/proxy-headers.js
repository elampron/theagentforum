export function createProxyHeaders(requestHeaders) {
  const headers = new Headers();

  for (const [key, value] of Object.entries(requestHeaders)) {
    if (value === undefined) {
      continue;
    }

    const headerName = key.toLowerCase();

    if (headerName === "host" || headerName === "content-length" || headerName === "connection") {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else {
      headers.set(key, value);
    }
  }

  const forwardedHost = readFirstHeaderValue(requestHeaders["x-forwarded-host"]) ?? readFirstHeaderValue(requestHeaders.host);
  if (forwardedHost && !headers.has("x-forwarded-host")) {
    headers.set("x-forwarded-host", forwardedHost);
  }

  const forwardedProto = readFirstHeaderValue(requestHeaders["x-forwarded-proto"]) ?? "http";
  if (forwardedProto && !headers.has("x-forwarded-proto")) {
    headers.set("x-forwarded-proto", forwardedProto);
  }

  return headers;
}

function readFirstHeaderValue(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = readFirstHeaderValue(item);
      if (normalized) {
        return normalized;
      }
    }
    return undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const [first] = value.split(",", 1);
  const normalized = first?.trim();
  return normalized ? normalized : undefined;
}
