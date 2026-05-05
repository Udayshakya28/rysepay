import { describe, expect, it } from "vitest";
import { hashRequestBody } from "./idempotency.js";

describe("hashRequestBody", () => {
  it("is deterministic for the same body", () => {
    const a = hashRequestBody({ amount: 100, currency: "INR" });
    const b = hashRequestBody({ amount: 100, currency: "INR" });
    expect(a).toBe(b);
  });

  it("is order-independent for object keys", () => {
    const a = hashRequestBody({ amount: 100, currency: "INR" });
    const b = hashRequestBody({ currency: "INR", amount: 100 });
    expect(a).toBe(b);
  });

  it("differs when values differ", () => {
    const a = hashRequestBody({ amount: 100 });
    const b = hashRequestBody({ amount: 101 });
    expect(a).not.toBe(b);
  });

  it("treats array order as significant", () => {
    const a = hashRequestBody({ items: [1, 2, 3] });
    const b = hashRequestBody({ items: [3, 2, 1] });
    expect(a).not.toBe(b);
  });

  it("differs by null vs missing", () => {
    const a = hashRequestBody({ x: null });
    const b = hashRequestBody({});
    expect(a).not.toBe(b);
  });
});
