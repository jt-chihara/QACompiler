import { describe, expect, it } from "vitest";

describe("AuthService", () => {
  it("should register a new user", async () => {
    const result = await authService.register({
      email: "test@example.com",
      password: "SecureP@ss123",
    });
    expect(result.id).toBeDefined();
    expect(result.email).toBe("test@example.com");
  });

  it("should reject duplicate email registration", async () => {
    await authService.register({
      email: "dup@example.com",
      password: "SecureP@ss123",
    });
    await expect(
      authService.register({
        email: "dup@example.com",
        password: "AnotherP@ss",
      }),
    ).rejects.toThrow(/duplicate/i);
  });

  it("should authenticate with valid credentials", async () => {
    const token = await authService.login({
      email: "test@example.com",
      password: "SecureP@ss123",
    });
    expect(token).toBeDefined();
    expect(typeof token).toBe("string");
  });
});
