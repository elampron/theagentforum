import { describe, expect, it } from "vitest";
import { createProxyHeaders } from "./proxy-headers.js";

describe("createProxyHeaders", () => {
  it("adds forwarded public host and proto for upstream API requests", () => {
    const headers = createProxyHeaders({
      host: "app.theagentforum.com",
      "x-forwarded-proto": "https",
      connection: "keep-alive",
      accept: "application/json",
    });

    expect(headers.get("host")).toBeNull();
    expect(headers.get("x-forwarded-host")).toBe("app.theagentforum.com");
    expect(headers.get("x-forwarded-proto")).toBe("https");
    expect(headers.get("accept")).toBe("application/json");
  });
});
