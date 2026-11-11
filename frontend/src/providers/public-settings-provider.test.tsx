import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { PublicSettingsProvider, usePublicSettings, useRefreshPublicSettings } from "./public-settings-provider";
import { useAuth } from "@/providers/auth-provider";
import { getPublicSettings } from "@/features/settings/api/public-settings.api";
import { createMockSession, createMockPublicSettings } from "@/test/test-utils";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/features/settings/api/public-settings.api", () => ({
  getPublicSettings: vi.fn(),
}));

function SettingsConsumer() {
  const settings = usePublicSettings();
  return (
    <div>
      <span data-testid="settings-value">
        {settings ? JSON.stringify(settings) : "null"}
      </span>
      <span data-testid="max-upload">
        {settings ? String(settings.maxUploadSizeMb) : "none"}
      </span>
    </div>
  );
}

describe("PublicSettingsProvider and usePublicSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("provides null settings and does not fetch when unauthenticated", () => {
    vi.mocked(useAuth).mockReturnValue({
      session: null,
      status: "unauthenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
      completePasswordChange: vi.fn(),
    });

    render(
      <PublicSettingsProvider>
        <SettingsConsumer />
      </PublicSettingsProvider>,
    );

    expect(screen.getByTestId("settings-value").textContent).toBe("null");
    expect(getPublicSettings).not.toHaveBeenCalled();
  });

  it("fetches settings using session token when authenticated and provides them", async () => {
    const mockSession = createMockSession({ token: "auth-token-xyz" });
    const mockSettings = createMockPublicSettings({ maxUploadSizeMb: 50 });

    vi.mocked(useAuth).mockReturnValue({
      session: mockSession,
      status: "authenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
      completePasswordChange: vi.fn(),
    });

    vi.mocked(getPublicSettings).mockResolvedValueOnce(mockSettings);

    render(
      <PublicSettingsProvider>
        <SettingsConsumer />
      </PublicSettingsProvider>,
    );

    expect(getPublicSettings).toHaveBeenCalledWith("auth-token-xyz");

    await waitFor(() => {
      expect(screen.getByTestId("max-upload").textContent).toBe("50");
    });
  });

  it("sets settings to null if getPublicSettings fails", async () => {
    const mockSession = createMockSession();

    vi.mocked(useAuth).mockReturnValue({
      session: mockSession,
      status: "authenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
      completePasswordChange: vi.fn(),
    });

    vi.mocked(getPublicSettings).mockRejectedValueOnce(new Error("Network failure"));

    render(
      <PublicSettingsProvider>
        <SettingsConsumer />
      </PublicSettingsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("settings-value").textContent).toBe("null");
    });
  });

  it("cancels in-flight request on unmount", async () => {
    const mockSession = createMockSession();

    let resolvePromise: (val: any) => void;
    const slowPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    vi.mocked(useAuth).mockReturnValue({
      session: mockSession,
      status: "authenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
      completePasswordChange: vi.fn(),
    });

    vi.mocked(getPublicSettings).mockReturnValueOnce(slowPromise as any);

    const { unmount } = render(
      <PublicSettingsProvider>
        <SettingsConsumer />
      </PublicSettingsProvider>,
    );

    unmount();
    // Resolve after unmount
    resolvePromise!(createMockPublicSettings());
    // No error thrown and clean unmount
  });

  describe("volver a pedir la configuración", () => {
    function RefreshConsumer() {
      const settings = usePublicSettings();
      const refresh = useRefreshPublicSettings();
      return (
        <div>
          <span data-testid="mobile">{settings ? String(settings.allowMobileApp) : "null"}</span>
          <button type="button" onClick={refresh}>
            refrescar
          </button>
        </div>
      );
    }

    const authenticate = () =>
      vi.mocked(useAuth).mockReturnValue({
        session: createMockSession({ token: "tok" }),
        status: "authenticated",
        login: vi.fn(),
        logout: vi.fn(),
        updateSessionUser: vi.fn(),
        expireSession: vi.fn(),
        completePasswordChange: vi.fn(),
      });

    it("al refrescar, un cambio hecho por un admin se ve sin recargar la página", async () => {
      authenticate();
      vi.mocked(getPublicSettings)
        .mockResolvedValueOnce(createMockPublicSettings({ allowMobileApp: false }))
        .mockResolvedValueOnce(createMockPublicSettings({ allowMobileApp: true }));

      render(
        <PublicSettingsProvider>
          <RefreshConsumer />
        </PublicSettingsProvider>,
      );
      await waitFor(() => expect(screen.getByTestId("mobile").textContent).toBe("false"));

      act(() => screen.getByRole("button", { name: "refrescar" }).click());

      await waitFor(() => expect(screen.getByTestId("mobile").textContent).toBe("true"));
      expect(getPublicSettings).toHaveBeenCalledTimes(2);
    });

    it("un fallo al refrescar conserva la configuración que ya había", async () => {
      authenticate();
      vi.mocked(getPublicSettings)
        .mockResolvedValueOnce(createMockPublicSettings({ allowMobileApp: true }))
        .mockRejectedValueOnce(new Error("offline"));

      render(
        <PublicSettingsProvider>
          <RefreshConsumer />
        </PublicSettingsProvider>,
      );
      await waitFor(() => expect(screen.getByTestId("mobile").textContent).toBe("true"));

      act(() => screen.getByRole("button", { name: "refrescar" }).click());
      await waitFor(() => expect(getPublicSettings).toHaveBeenCalledTimes(2));

      expect(screen.getByTestId("mobile").textContent).toBe("true");
    });

    it("al volver a la pestaña, la configuración se pide de nuevo", async () => {
      authenticate();
      vi.mocked(getPublicSettings).mockResolvedValue(createMockPublicSettings());

      render(
        <PublicSettingsProvider>
          <RefreshConsumer />
        </PublicSettingsProvider>,
      );
      await waitFor(() => expect(getPublicSettings).toHaveBeenCalledTimes(1));

      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });

      await waitFor(() => expect(getPublicSettings).toHaveBeenCalledTimes(2));
    });

    it("sin proveedor, refrescar no hace nada", () => {
      function Orphan() {
        const refresh = useRefreshPublicSettings();
        return <button onClick={refresh}>x</button>;
      }
      render(<Orphan />);

      expect(() => act(() => screen.getByRole("button").click())).not.toThrow();
    });
  });
});
