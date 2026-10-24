import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  prisma: {
    loginOtpChallenge: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }));
vi.mock("@/lib/redis", () => ({ redis: { get: vi.fn(), set: vi.fn(), on: vi.fn() } }));
vi.mock("@/services/mail.service", () => ({ mailService: { send: vi.fn() } }));

import { authService } from "../auth.service";

import { hashOtp } from "@/lib/security";

const challenge = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  challengeId: "ch1",
  userId: "u1",
  otpHash: hashOtp("123456"),
  attempts: 0,
  maxAttempts: 5,
  consumedAt: null,
  expiresAt: new Date(Date.now() + 60_000),
  ...over,
});
const input = (otp: string) => ({ challengeId: "ch1", otp }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  m.prisma.loginOtpChallenge.findUnique.mockResolvedValue(challenge());
  m.prisma.loginOtpChallenge.updateMany.mockResolvedValue({ count: 1 });
  m.prisma.user.findUnique.mockResolvedValue({ id: "u1", isActive: true });
});

describe("login OTP guess limit is enforced atomically", () => {
  it("reserves a guess with a conditional update (attempts < max) before comparing", async () => {
    await expect(authService.verifyLoginOtp(input("000000"))).rejects.toMatchObject({ statusCode: 401 });
    const first = m.prisma.loginOtpChallenge.updateMany.mock.calls[0]![0];
    expect(first.where).toMatchObject({ id: "c1", consumedAt: null, attempts: { lt: 5 } });
    expect(first.data).toEqual({ attempts: { increment: 1 } });
  });

  it("a burst past the limit is rejected even if each request read a stale attempts value", async () => {
    // Every parallel request read attempts=0, but the database refuses the reservation for the ones over the limit.
    m.prisma.loginOtpChallenge.updateMany.mockResolvedValue({ count: 0 });
    // Even the CORRECT code is refused once no guess can be reserved.
    await expect(authService.verifyLoginOtp(input("123456"))).rejects.toMatchObject({ message: expect.stringContaining("Too many") });
    expect(m.prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("two simultaneous correct submissions cannot both consume the code", async () => {
    m.prisma.loginOtpChallenge.updateMany
      .mockResolvedValueOnce({ count: 1 }) // reserve a guess
      .mockResolvedValueOnce({ count: 0 }); // somebody else consumed it first
    await expect(authService.verifyLoginOtp(input("123456"))).rejects.toMatchObject({ statusCode: 401 });
    expect(m.prisma.user.update).not.toHaveBeenCalled();
  });
});
