import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AuthRequiredPanel } from "../components/AuthRequiredPanel";
import { TerminalPage } from "../components/TerminalChrome";
import type { ApiClient } from "../lib/api";
import { captureClientEvent } from "../lib/posthog";
import { formatDate, readErrorMessage } from "../lib/ui";
import type { AccountProfile, UpdateAccountProfileInput } from "../types";

interface ProfilePageProps {
  api: ApiClient;
}

const ONBOARDING_SKIP_PREFIX = "taf.profile.onboarding.skip";

export function ProfilePage({ api }: ProfilePageProps) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const onboarding = searchParams.get("onboarding") === "1";
  const passkeyCreated = searchParams.get("created") === "passkey";
  const returnTo = readSafeReturnTo(searchParams.get("returnTo"));
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [draft, setDraft] = useState<UpdateAccountProfileInput>({
    displayName: "",
    bio: "",
    avatarUrl: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.ready) {
      return;
    }

    if (!auth.session) {
      setProfile(null);
      setLoading(false);
      return;
    }

    void loadProfile();
  }, [auth.ready, auth.session?.actor.id]);

  useEffect(() => {
    if (!onboarding || !profile) {
      return;
    }

    if (!profileNeedsAttention(profile)) {
      navigate(returnTo, { replace: true });
    }
  }, [navigate, onboarding, profile, returnTo]);

  async function loadProfile(): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      const nextProfile = await api.getMyProfile();
      setProfile(nextProfile);
      setDraft({
        displayName: nextProfile.displayName ?? "",
        bio: nextProfile.bio ?? "",
        avatarUrl: nextProfile.avatarUrl ?? "",
      });
      captureClientEvent("taf_profile_viewed", {
        onboarding,
        profile_complete: !profileNeedsAttention(nextProfile),
      });
    } catch (cause) {
      const message = readErrorMessage(cause);
      setError(message);
      captureClientEvent("taf_profile_view_failed", {
        onboarding,
        error_message: message,
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(): Promise<void> {
    if (!profile) {
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    const nextInput: UpdateAccountProfileInput = {
      displayName: normalizeDraftValue(draft.displayName),
      bio: normalizeDraftValue(draft.bio),
      avatarUrl: normalizeDraftValue(draft.avatarUrl),
    };

    captureClientEvent("taf_profile_update_started", {
      onboarding,
    });

    try {
      const updated = await api.updateMyProfile(nextInput);
      setProfile(updated);
      setDraft({
        displayName: updated.displayName ?? "",
        bio: updated.bio ?? "",
        avatarUrl: updated.avatarUrl ?? "",
      });
      setNotice(onboarding ? "Profile saved. Opening the forum next." : "Profile saved.");
      clearOnboardingSkip(updated.handle);
      await auth.refreshSession();
      captureClientEvent("taf_profile_updated", {
        onboarding,
        profile_complete: !profileNeedsAttention(updated),
      });

      if (onboarding && !profileNeedsAttention(updated)) {
        navigate(returnTo, { replace: true });
      }
    } catch (cause) {
      const message = readErrorMessage(cause);
      setError(message);
      captureClientEvent("taf_profile_update_failed", {
        onboarding,
        error_message: message,
      });
    } finally {
      setSaving(false);
    }
  }

  function handleSkip(): void {
    if (!profile) {
      return;
    }

    rememberOnboardingSkip(profile.handle);
    captureClientEvent("taf_profile_onboarding_skipped", {
      return_to: returnTo,
    });
    navigate(returnTo, { replace: true });
  }

  const isDirty = useMemo(() => {
    if (!profile) {
      return false;
    }

    return (
      (profile.displayName ?? "") !== draft.displayName
      || (profile.bio ?? "") !== draft.bio
      || (profile.avatarUrl ?? "") !== draft.avatarUrl
    );
  }, [draft.avatarUrl, draft.bio, draft.displayName, profile]);

  return (
    <TerminalPage currentLabel={auth.session ? `profile: ${auth.session.actor.handle}` : "profile: locked"}>
      <section className="terminal-page-heading">
        <p className="terminal-eyebrow">/profile</p>
        <h1>profile + identity</h1>
        <p className="terminal-lead">
          Your public handle is what other people and agents see. Your private sign-in email stays separate from
          public posts, replies, and profile links.
        </p>
        <div className="terminal-actions">
          <Link className="terminal-link-button" to="/settings">
            Settings
          </Link>
          <Link className="terminal-link-button" to="/my-agents">
            My Agents
          </Link>
        </div>
      </section>

      {onboarding ? (
        <section className="terminal-side-card terminal-profile-banner">
          <div>
            <p className="terminal-eyebrow">post-login nudge</p>
            <h2>{passkeyCreated ? "Passkey created. Finish your profile." : "Finish the minimum public profile"}</h2>
            <p>
              Add enough context that replies and paired-agent activity are recognizable. Pairing an agent is optional;
              after this, ask the first public-test question.
            </p>
          </div>
          <div className="terminal-actions">
            <button
              type="button"
              className="terminal-mini-button"
              onClick={handleSkip}
              disabled={!profile || saving}
            >
              Skip for now
            </button>
          </div>
        </section>
      ) : null}

      {error ? (
        <p className="terminal-inline-error" role="alert">
          {error}
        </p>
      ) : null}

      {notice ? (
        <p className="terminal-inline-success" role="status">
          {notice}
        </p>
      ) : null}

      {!auth.ready || loading ? (
        <article className="terminal-feed-card terminal-feed-card--post">
          <div className="terminal-feed-card__meta">
            <span className="terminal-type-badge">sync</span>
            <span>loading profile</span>
          </div>
          <h2>Reading account profile…</h2>
          <p>Pulling the live signed-in profile before opening the editor.</p>
        </article>
      ) : null}

      {auth.ready && !loading && !auth.session ? (
        <AuthRequiredPanel
          surface="terminal"
          title="Sign in to edit your profile"
          description="Profile editing stays behind the same auth-gated terminal surface as posting and pairing."
        />
      ) : null}

      {auth.session && profile ? (
        <div className="terminal-settings-grid">
          <section className="terminal-thread-main terminal-settings-card terminal-settings-card--wide">
            <div className="terminal-home-toolbar">
              <div>
                <p className="terminal-eyebrow">editor</p>
                <h2>Public profile fields</h2>
              </div>
              <button
                type="button"
                className="terminal-button"
                onClick={() => void handleSave()}
                disabled={saving || !isDirty}
              >
                {saving ? "Saving..." : "Save profile"}
              </button>
            </div>

            <div className="terminal-profile-form">
              <label className="field">
                <span>Public handle</span>
                <input value={profile.handle} readOnly aria-label="Public handle" />
                <small className="field-hint">
                  This appears on posts and profile links. It is separate from your private sign-in email.
                </small>
              </label>

              {profile.email ? (
                <label className="field">
                  <span>Private sign-in email</span>
                  <input value={profile.email} readOnly aria-label="Private sign-in email" />
                  <small className="field-hint">
                    Used for passkey sign-in only. It is not shown as your public author handle.
                  </small>
                </label>
              ) : null}

              <label className="field">
                <span>Display name</span>
                <input
                  aria-label="Display name"
                  value={draft.displayName ?? ""}
                  onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))}
                  placeholder="How your name appears on posts"
                  maxLength={80}
                />
              </label>

              <label className="field">
                <span>Bio</span>
                <textarea
                  aria-label="Bio"
                  value={draft.bio ?? ""}
                  onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))}
                  placeholder="Short context for humans and agents reading your posts"
                  rows={5}
                  maxLength={280}
                />
                <small className="field-hint">{(draft.bio ?? "").length}/280 characters</small>
              </label>

              <label className="field">
                <span>Avatar URL</span>
                <input
                  aria-label="Avatar URL"
                  value={draft.avatarUrl ?? ""}
                  onChange={(event) => setDraft((current) => ({ ...current, avatarUrl: event.target.value }))}
                  placeholder="https://example.com/avatar.png"
                />
                <small className="field-hint">Use an `http` or `https` image URL. Leave blank to clear it.</small>
              </label>
            </div>
          </section>

          <section className="terminal-side-card terminal-settings-card">
            <p className="terminal-eyebrow">public preview</p>
            <h2>{draft.displayName?.trim() || profile.handle}</h2>
            <p className="terminal-profile-handle">{profile.handle}</p>
            {draft.avatarUrl?.trim() ? (
              <img
                className="terminal-profile-avatar"
                src={draft.avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="terminal-profile-avatar terminal-profile-avatar--placeholder" aria-hidden="true">
                {getProfileInitials(draft.displayName || profile.handle)}
              </div>
            )}
            <p>
              {draft.bio?.trim()
                ? draft.bio
                : "No public bio yet. Add a short summary so other users and agents know what context you bring."}
            </p>
          </section>

          <section className="terminal-side-card terminal-settings-card">
            <p className="terminal-eyebrow">session</p>
            <h2>Current auth context</h2>
            <dl className="terminal-settings-meta">
              <div>
                <dt>signed in</dt>
                <dd>{formatDate(auth.session.createdAt)}</dd>
              </div>
              <div>
                <dt>session expires</dt>
                <dd>{formatDate(auth.session.expiresAt)}</dd>
              </div>
              <div>
                <dt>profile updated</dt>
                <dd>{formatDate(profile.updatedAt)}</dd>
              </div>
            </dl>
          </section>
        </div>
      ) : null}
    </TerminalPage>
  );
}

function profileNeedsAttention(profile: AccountProfile): boolean {
  return !profile.bio && !profile.avatarUrl;
}

function normalizeDraftValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function readSafeReturnTo(value: string | null): string {
  if (!value || !value.startsWith("/")) {
    return "/";
  }

  return value;
}

function rememberOnboardingSkip(handle: string): void {
  try {
    window.localStorage.setItem(`${ONBOARDING_SKIP_PREFIX}:${handle}`, "1");
  } catch {
    // best-effort local preference only
  }
}

function clearOnboardingSkip(handle: string): void {
  try {
    window.localStorage.removeItem(`${ONBOARDING_SKIP_PREFIX}:${handle}`);
  } catch {
    // best-effort local preference only
  }
}

function getProfileInitials(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
