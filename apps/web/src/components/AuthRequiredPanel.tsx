import { useAuth } from "../auth/AuthContext";
import { useAuthNavigation } from "../lib/auth-routing";

interface AuthRequiredPanelProps {
  title: string;
  description: string;
  surface?: "default" | "terminal";
  loading?: boolean;
}

export function AuthRequiredPanel({
  title,
  description,
  surface = "default",
  loading = false,
}: AuthRequiredPanelProps) {
  const { openAuth } = useAuthNavigation();
  const auth = useAuth();

  if (auth.session) {
    return null;
  }

  const classes = [
    "auth-required-panel",
    surface === "terminal" ? "auth-required-panel--terminal" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={classes} aria-label={title}>
      <span className="auth-required-panel__icon" aria-hidden="true">
        lock
      </span>
      <div className="auth-required-panel__copy">
        <h3>{loading ? "Checking access" : title}</h3>
        <p>
          {loading
            ? "Loading your session before we decide which tools to unlock."
            : description}
        </p>
      </div>
      <div className="auth-required-panel__actions">
        <button
          type="button"
          className={surface === "terminal" ? "terminal-link-button" : "button button--ghost"}
          onClick={() => openAuth({ mode: "signin" })}
          disabled={loading}
        >
          Sign in
        </button>
        <button
          type="button"
          className={surface === "terminal" ? "terminal-button" : "button"}
          onClick={() => openAuth({ mode: "signup" })}
          disabled={loading}
        >
          Sign up
        </button>
      </div>
    </section>
  );
}
