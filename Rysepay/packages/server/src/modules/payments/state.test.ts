import { describe, expect, it } from "vitest";
import { assertTransition, canTransition } from "./state.js";

describe("payment intent state machine", () => {
  it("allows created -> processing", () => {
    expect(() => assertTransition("created", "processing")).not.toThrow();
  });

  it("allows processing -> completed", () => {
    expect(() => assertTransition("processing", "completed")).not.toThrow();
  });

  it("allows completed -> refunded", () => {
    expect(() => assertTransition("completed", "refunded")).not.toThrow();
  });

  it("rejects refunded -> completed", () => {
    expect(() => assertTransition("refunded", "completed")).toThrow();
  });

  it("rejects failed -> any other state", () => {
    expect(canTransition("failed", "completed")).toBe(false);
    expect(canTransition("failed", "refunded")).toBe(false);
  });

  it("treats same-state as a no-op", () => {
    expect(canTransition("processing", "processing")).toBe(true);
  });

  it("rejects skipping straight from created to refunded", () => {
    expect(canTransition("created", "refunded")).toBe(false);
  });
});
