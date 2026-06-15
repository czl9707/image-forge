import { describe, expect, it } from "vitest";
import { registry } from "../registry";

describe("registry", () => {
  it("is non-empty", () => {
    expect(registry.length).toBeGreaterThan(0);
  });

  it("has unique ids", () => {
    const ids = registry.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every entry has a name and callable Preview + Controls", () => {
    for (const g of registry) {
      expect(typeof g.name).toBe("string");
      expect(typeof g.Preview).toBe("function");
      expect(typeof g.Controls).toBe("function");
    }
  });
});
