import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "./encryption.js";

describe("aes-256-gcm encrypt/decrypt", () => {
  it("round-trips arbitrary strings", () => {
    const original = "+91 98765 43210";
    expect(decrypt(encrypt(original))).toBe(original);
  });

  it("round-trips empty string", () => {
    expect(decrypt(encrypt(""))).toBe("");
  });

  it("produces a different ciphertext each time (nonce)", () => {
    const a = encrypt("hello");
    const b = encrypt("hello");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("hello");
    expect(decrypt(b)).toBe("hello");
  });

  it("rejects tampered ciphertext", () => {
    const ct = encrypt("secret");
    const buf = Buffer.from(ct, "base64");
    buf[buf.length - 1] ^= 0xff;
    expect(() => decrypt(buf.toString("base64"))).toThrow();
  });
});
