import { describe, expect, it } from "vitest";
import { computeInputHash } from "../../src/lib/input-hash.js";

describe("computeInputHash", () => {
  it("should return the same hash for identical inputs", () => {
    const hash1 = computeInputHash("Analyze this PRD", "gpt-4o");
    const hash2 = computeInputHash("Analyze this PRD", "gpt-4o");
    expect(hash1).toBe(hash2);
  });

  it("should return different hash for different prompts", () => {
    const hash1 = computeInputHash("Analyze this PRD", "gpt-4o");
    const hash2 = computeInputHash("Design test cases", "gpt-4o");
    expect(hash1).not.toBe(hash2);
  });

  it("should return different hash for different models", () => {
    const hash1 = computeInputHash("Analyze this PRD", "gpt-4o");
    const hash2 = computeInputHash("Analyze this PRD", "claude-sonnet-4-20250514");
    expect(hash1).not.toBe(hash2);
  });

  it("should return a hex string", () => {
    const hash = computeInputHash("test prompt", "gpt-4o");
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it("should return a consistent length hash", () => {
    const hash1 = computeInputHash("short", "gpt-4o");
    const hash2 = computeInputHash("a very long prompt that goes on and on", "gpt-4o");
    expect(hash1.length).toBe(hash2.length);
    expect(hash1.length).toBe(64); // SHA-256 hex = 64 chars
  });
});
