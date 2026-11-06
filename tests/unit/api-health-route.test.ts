// @vitest-environment node
import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("returns 200 with a minimal public status", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body)).toEqual(["data"]);
    expect(Object.keys(body.data).sort()).toEqual(["service", "status", "time"]);
    expect(body.data.status).toBe("ok");
    expect(Number.isNaN(Date.parse(body.data.time))).toBe(false);
  });

  it("exposes no internal details", async () => {
    const text = await GET().text();
    for (const secretish of ["supabase", "openai", "postgres", "version", "env", "key", "127.0.0.1", "stack"]) {
      expect(text.toLowerCase()).not.toContain(secretish);
    }
  });

  it("is not cacheable", () => {
    expect(GET().headers.get("cache-control")).toBe("no-store");
  });
});
