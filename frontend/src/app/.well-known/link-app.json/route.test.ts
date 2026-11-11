import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { apiUrl: "https://api.empresa.com/api", socketUrl: "https://api.empresa.com" },
}));

import { GET } from "./route";

describe("GET /.well-known/link-app.json", () => {
  it("responde el documento de descubrimiento con las URL configuradas", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({
      app: "link",
      v: 1,
      apiUrl: "https://api.empresa.com/api",
      socketUrl: "https://api.empresa.com",
    });
  });

  it("permite cachearlo por poco tiempo", () => {
    expect(GET().headers.get("cache-control")).toBe("public, max-age=300");
  });
});
