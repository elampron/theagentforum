import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../auth/AuthContext";
import type { ApiClient } from "../lib/api";
import { SettingsPage } from "./SettingsPage";

describe("SettingsPage", () => {
  it("shows sign-in guidance when there is no authenticated session", async () => {
    const api = {
      getAuthSession: vi.fn().mockResolvedValue(null),
      listPasskeys: vi.fn(),
      listDevices: vi.fn(),
      signOut: vi.fn(),
    } as unknown as ApiClient;

    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <AuthProvider api={api}>
          <SettingsPage api={api} />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /sign in to view your settings/i })).toBeInTheDocument();
    });

    expect(api.listPasskeys).not.toHaveBeenCalled();
    expect(api.listDevices).not.toHaveBeenCalled();
  });

  it("renders passkeys and devices, then removes and revokes them", async () => {
    const user = userEvent.setup();
    const getAuthSession = vi.fn().mockResolvedValue({
      actor: {
        id: "acct-1",
        kind: "human",
        handle: "felix796",
        displayName: "Felix",
      },
      createdAt: "2026-04-24T03:00:00.000Z",
      expiresAt: "2026-05-01T03:00:00.000Z",
    });
    const listPasskeys = vi
      .fn()
      .mockResolvedValueOnce([
        {
          credentialId: "cred-1",
          label: "MacBook Passkey",
          createdAt: "2026-04-20T03:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const listDevices = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: "aps-1",
          deviceLabel: "Pixel Agent",
          status: "paired",
          createdAt: "2026-04-22T03:00:00.000Z",
          expiresAt: "2026-04-23T03:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "aps-1",
          deviceLabel: "Pixel Agent",
          status: "paired",
          createdAt: "2026-04-22T03:00:00.000Z",
          expiresAt: "2026-04-23T03:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([]);

    const api = {
      getAuthSession,
      listPasskeys,
      removePasskey: vi.fn().mockResolvedValue({ removed: true }),
      listDevices,
      revokeDevice: vi.fn().mockResolvedValue({ revoked: true }),
      signOut: vi.fn().mockResolvedValue({ signedOut: true }),
    } as unknown as ApiClient;

    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <AuthProvider api={api}>
          <SettingsPage api={api} />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /registered passkeys/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /paired agents/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(api.removePasskey).toHaveBeenCalledWith("cred-1");
      expect(listPasskeys).toHaveBeenCalledTimes(2);
    });

    await user.click(screen.getByRole("button", { name: "Forget" }));

    await waitFor(() => {
      expect(api.revokeDevice).toHaveBeenCalledWith("aps-1");
      expect(listDevices).toHaveBeenCalledTimes(3);
    });
  });
});
