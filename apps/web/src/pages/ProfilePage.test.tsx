import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../auth/AuthContext";
import type { ApiClient } from "../lib/api";
import { ProfilePage } from "./ProfilePage";

describe("ProfilePage", () => {
  it("shows sign-in guidance when there is no authenticated session", async () => {
    const api = {
      getAuthSession: vi.fn().mockResolvedValue(null),
      signOut: vi.fn(),
    } as unknown as ApiClient;

    render(
      <MemoryRouter initialEntries={["/profile"]}>
        <AuthProvider api={api}>
          <ProfilePage api={api} />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /sign in to edit your profile/i })).toBeInTheDocument();
    });
  });

  it("loads the profile editor, saves updates, and exits onboarding", async () => {
    const user = userEvent.setup();
    const getAuthSession = vi
      .fn()
      .mockResolvedValueOnce({
        actor: {
          id: "acct-1",
          kind: "human",
          handle: "eric@example.com",
          displayName: "Eric",
        },
        createdAt: "2026-04-24T03:00:00.000Z",
        expiresAt: "2026-05-01T03:00:00.000Z",
      })
      .mockResolvedValueOnce({
        actor: {
          id: "acct-1",
          kind: "human",
          handle: "eric@example.com",
          displayName: "Launch Eric",
        },
        createdAt: "2026-04-24T03:00:00.000Z",
        expiresAt: "2026-05-01T03:00:00.000Z",
      });

    const api = {
      getAuthSession,
      getMyProfile: vi.fn().mockResolvedValue({
        id: "acct-1",
        handle: "eric@example.com",
        displayName: "Eric",
        createdAt: "2026-04-24T03:00:00.000Z",
        updatedAt: "2026-04-24T03:00:00.000Z",
      }),
      updateMyProfile: vi.fn().mockResolvedValue({
        id: "acct-1",
        handle: "eric@example.com",
        displayName: "Launch Eric",
        bio: "Ships the launch checklist.",
        createdAt: "2026-04-24T03:00:00.000Z",
        updatedAt: "2026-04-29T03:00:00.000Z",
      }),
      signOut: vi.fn(),
    } as unknown as ApiClient;

    render(
      <MemoryRouter initialEntries={["/profile?onboarding=1&returnTo=/forum"]}>
        <Routes>
          <Route
            path="/profile"
            element={(
              <AuthProvider api={api}>
                <ProfilePage api={api} />
              </AuthProvider>
            )}
          />
          <Route path="/forum" element={<p>forum stream</p>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /public profile fields/i })).toBeInTheDocument();
    });

    await user.clear(screen.getByLabelText("Display name"));
    await user.type(screen.getByLabelText("Display name"), "Launch Eric");
    await user.type(screen.getByLabelText("Bio"), "Ships the launch checklist.");
    await user.click(screen.getByRole("button", { name: /save profile/i }));

    await waitFor(() => {
      expect(api.updateMyProfile).toHaveBeenCalledWith({
        displayName: "Launch Eric",
        bio: "Ships the launch checklist.",
        avatarUrl: undefined,
      });
      expect(screen.getByText("forum stream")).toBeInTheDocument();
    });
  });
});
