import { useLocation, useNavigate } from "react-router-dom";

export type AuthMode = "signin" | "signup";

interface OpenAuthOptions {
  mode?: AuthMode;
}

export function buildAuthPath(
  returnTo: string,
  options: OpenAuthOptions = {},
): string {
  const searchParams = new URLSearchParams();
  searchParams.set("returnTo", returnTo);

  if (options.mode) {
    searchParams.set("mode", options.mode);
  }

  return `/auth?${searchParams.toString()}`;
}

export function buildPairingAuthPath(returnTo?: string): string {
  const searchParams = new URLSearchParams();
  searchParams.set("flow", "pairing");

  if (returnTo) {
    searchParams.set("returnTo", returnTo);
  }

  return `/auth?${searchParams.toString()}`;
}

export function readSafeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/")) {
    return "/";
  }

  return value;
}

export function useAuthNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}${location.hash}`;

  function openAuth(options: OpenAuthOptions = {}): void {
    navigate(buildAuthPath(returnTo, options), {
      state: {
        backgroundLocation: location,
      },
    });
  }

  return {
    returnTo,
    openAuth,
  };
}
