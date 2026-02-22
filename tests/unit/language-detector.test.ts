import { describe, expect, it } from "vitest";
import { detectLanguage } from "../../src/lib/language-detector.js";

describe("detectLanguage", () => {
  it("should detect TypeScript files", () => {
    expect(detectLanguage("app.ts")).toBe("typescript");
    expect(detectLanguage("component.tsx")).toBe("typescript");
  });

  it("should detect JavaScript files", () => {
    expect(detectLanguage("app.js")).toBe("javascript");
    expect(detectLanguage("component.jsx")).toBe("javascript");
    expect(detectLanguage("module.mjs")).toBe("javascript");
    expect(detectLanguage("common.cjs")).toBe("javascript");
  });

  it("should detect Go files", () => {
    expect(detectLanguage("handler.go")).toBe("go");
  });

  it("should detect Python files", () => {
    expect(detectLanguage("main.py")).toBe("python");
  });

  it("should return unknown for unsupported extensions", () => {
    expect(detectLanguage("file.rs")).toBe("unknown");
    expect(detectLanguage("file.java")).toBe("unknown");
    expect(detectLanguage("file.txt")).toBe("unknown");
    expect(detectLanguage("Makefile")).toBe("unknown");
  });

  it("should handle paths with directories", () => {
    expect(detectLanguage("src/services/app.ts")).toBe("typescript");
    expect(detectLanguage("backend/handler.go")).toBe("go");
  });
});
