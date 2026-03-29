import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { captureClientEvent, isPostHogEnabled } from "../lib/posthog";

export function PostHogPageViewTracker() {
  const location = useLocation();

  useEffect(() => {
    if (!isPostHogEnabled()) {
      return;
    }

    captureClientEvent("$pageview", {
      pathname: location.pathname,
      search: location.search,
      url: typeof window === "undefined" ? location.pathname : window.location.href,
    });
  }, [location.pathname, location.search]);

  return null;
}
