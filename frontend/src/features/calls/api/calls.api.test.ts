import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/lib/api-client";
import { getIceServers } from "./calls.api";

vi.mock("@/lib/api-client", () => ({ apiRequest: vi.fn() }));

describe("getIceServers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pide los servidores ICE con el token de la sesión", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ iceServers: [], ttlSeconds: null });

    await expect(getIceServers("tok")).resolves.toEqual({ iceServers: [], ttlSeconds: null });
    expect(apiRequest).toHaveBeenCalledWith("/v1/calls/ice-servers", { token: "tok" });
  });
});
