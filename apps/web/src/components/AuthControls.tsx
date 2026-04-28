import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import {
  buildAuthPath,
  buildPairingAuthPath,
  useAuthNavigation,
} from "../lib/auth-routing";
import { describeActor, getActorInitials } from "../lib/ui";

interface AuthControlsProps {
  variant?: "default" | "terminal";
}

export function AuthControls({ variant = "default" }: AuthControlsProps) {
  const auth = useAuth();
  const navigate = useNavigate();
  const { openAuth, returnTo } = useAuthNavigation();
  const [signingOut, setSigningOut] = useState(false);

  if (!auth.session) {
    return (
      <div className={`auth-header-actions auth-header-actions--${variant}`}>
        <button
          type="button"
          className={variant === "terminal" ? "terminal-link-button" : "button button--ghost"}
          onClick={() => openAuth({ mode: "signin" })}
        >
          Sign in
        </button>
        <button
          type="button"
          className={variant === "terminal" ? "terminal-button" : "button"}
          onClick={() => openAuth({ mode: "signup" })}
        >
          Sign up
        </button>
      </div>
    );
  }

  const actor = auth.session.actor;
  const actorName = describeActor(actor);

  async function handleSignOut(): Promise<void> {
    setSigningOut(true);

    try {
      await auth.signOut();
      navigate(returnTo, { replace: true });
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <details className={`auth-menu auth-menu--${variant}`}>
      <summary className="auth-menu__trigger">
        <span className="auth-menu__avatar" aria-hidden="true">
          {getActorInitials(actor)}
        </span>
        <span className="auth-menu__label">
          <strong>{actorName}</strong>
          <small>{actor.handle}</small>
        </span>
      </summary>

      <div className="auth-menu__panel" role="menu" aria-label="Profile menu">
        <Link role="menuitem" to="/settings">
          Settings
        </Link>
        <Link role="menuitem" to="/profile">
          My Profile
        </Link>
        <Link role="menuitem" to="/my-agents">
          My Agents
        </Link>
        <Link
          role="menuitem"
          to={buildAuthPath("/settings", { mode: "signup" })}
        >
          Add passkey
        </Link>
        <Link
          role="menuitem"
          to={buildPairingAuthPath("/my-agents")}
        >
          Pair agent
        </Link>
        <button
          type="button"
          role="menuitem"
          onClick={() => void handleSignOut()}
          disabled={signingOut}
        >
          {signingOut ? "Signing out..." : "Sign out"}
        </button>
      </div>
    </details>
  );
}
