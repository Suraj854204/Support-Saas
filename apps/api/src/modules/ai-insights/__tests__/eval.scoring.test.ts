import { describe, expect, it } from "vitest";

import { scoreCase } from "../eval.scoring";
import { isFallbackReply } from "../fallback";

const FALLBACK =
  "I'm sorry, but I couldn't find this information in our knowledge base. Please contact a human support agent.";

const spec = (over: Partial<Parameters<typeof scoreCase>[0]> = {}) => ({
  expectedKeywords: [],
  forbiddenKeywords: [],
  expectFallback: false,
  ...over,
});

describe("isFallbackReply", () => {
  it("recognises the AI service's decline sentence regardless of case and spacing", () => {
    expect(isFallbackReply(FALLBACK)).toBe(true);
    expect(isFallbackReply(`  ${FALLBACK.toUpperCase()}  `)).toBe(true);
    expect(isFallbackReply("I'm sorry,   but I couldn't find this information\nin our KB")).toBe(true);
  });

  it("does not flag a real answer that merely apologises", () => {
    expect(isFallbackReply("I'm sorry about the delay. Refunds take 7 days.")).toBe(false);
    expect(isFallbackReply("")).toBe(false);
  });
});

describe("scoreCase", () => {
  it("passes when every expected keyword is present (case-insensitive)", () => {
    const verdict = scoreCase(spec({ expectedKeywords: ["7 days", "refund"] }), "Your REFUND will arrive within 7 days.");
    expect(verdict).toEqual({ passed: true, reasons: [] });
  });

  it("names each missing keyword", () => {
    const verdict = scoreCase(spec({ expectedKeywords: ["7 days", "original payment method"] }), "Refunds are processed in 7 days.");
    expect(verdict.passed).toBe(false);
    expect(verdict.reasons).toEqual(['Missing expected keyword: "original payment method"']);
  });

  it("fails when a forbidden keyword appears (e.g. a wrong or invented policy)", () => {
    const verdict = scoreCase(spec({ forbiddenKeywords: ["3 days"] }), "Refunds arrive in 3 days.");
    expect(verdict.passed).toBe(false);
    expect(verdict.reasons[0]).toContain('forbidden keyword: "3 days"');
  });

  it("fails an answerable question when the AI declined, without piling on missing-keyword noise", () => {
    const verdict = scoreCase(spec({ expectedKeywords: ["refund"] }), FALLBACK);
    expect(verdict.passed).toBe(false);
    expect(verdict.reasons).toHaveLength(1);
    expect(verdict.reasons[0]).toContain("declined");
  });

  it("passes an expect-fallback case only when the AI actually declines", () => {
    expect(scoreCase(spec({ expectFallback: true }), FALLBACK).passed).toBe(true);

    const answered = scoreCase(spec({ expectFallback: true }), "Sure! Our CEO's favourite colour is blue.");
    expect(answered.passed).toBe(false);
    expect(answered.reasons[0]).toContain("decline");
  });

  it("with no keywords, simply requires that the AI answered", () => {
    expect(scoreCase(spec(), "Here is how to reset your password.").passed).toBe(true);
    expect(scoreCase(spec(), FALLBACK).passed).toBe(false);
  });

  it("ignores blank keywords instead of matching everything", () => {
    // An empty needle would trivially be "included" in any text; make sure whitespace-only keywords can't mask a miss.
    const verdict = scoreCase(spec({ expectedKeywords: ["refund"] }), "Contact support.");
    expect(verdict.passed).toBe(false);
  });
});
