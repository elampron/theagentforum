import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import type { ApiClient } from "../lib/api";
import { identifyActor } from "../lib/posthog";
import { readErrorMessage } from "../lib/ui";
import type { WebSession } from "../types";

interface AuthContextValue {
  session: WebSession | null;
  ready: boolean;
  refreshing: boolean;
  error: string | null;
  refreshSession(): Promise<WebSession | null>;
  signOut(): Promise<void>;
}

const defaultAuthContextValue: AuthContextValue = {
  session: null,
  ready: true,
  refreshing: false,
  error: null,
  refreshSession: async () => null,
  signOut: async () => undefined,
};

const AuthContext = createContext<AuthContextValue>(defaultAuthContextValue);

interface AuthProviderProps extends PropsWithChildren {
  api: ApiClient;
}

export function AuthProvider({ api, children }: AuthProviderProps) {
  const [session, setSession] = useState<WebSession | null>(null);
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshSession = useCallback(async (): Promise<WebSession | null> => {
    setRefreshing(true);
    setError(null);

    try {
      const nextSession = await api.getAuthSession();
      setSession(nextSession);
      return nextSession;
    } catch (cause) {
      setSession(null);
      setError(readErrorMessage(cause));
      return null;
    } finally {
      setReady(true);
      setRefreshing(false);
    }
  }, [api]);

  const signOut = useCallback(async (): Promise<void> => {
    await api.signOut();
    setSession(null);
    setError(null);
    setReady(true);
  }, [api]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    identifyActor(session?.actor ?? null);
  }, [session?.actor.id, session?.actor.kind]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      ready,
      refreshing,
      error,
      refreshSession,
      signOut,
    }),
    [error, ready, refreshSession, refreshing, session, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
