import { describe, expect, it } from "vitest";

import { assessSeverity, largestAmount } from "../severity";

describe("assessSeverity", () => {
  it.each([
    ["The charger started smoking and I think it is defective", "critical"],
    ["Mera phone kharab nikla, aag lag gayi", "critical"],
    ["I will take legal action and go to consumer court", "critical"],
    ["Someone hacked my account, this is fraud", "critical"],
  ])("flags serious matter: %s", (text, level) => {
    expect(assessSeverity(text).level).toBe(level);
  });

  it("flags a large amount even with calm wording", () => {
    const r = assessSeverity("Please check the payment of Rs 75,000 for my order");
    expect(r.level).toBe("critical");
    expect(r.reasons[0]).toMatch(/Large amount/);
  });

  it("a plain refund question is not escalated", () => {
    expect(assessSeverity("How do I get a refund for my order?").level).toBe("none");
    expect(assessSeverity("What are your opening hours?").level).toBe("none");
  });

  it("two mild signals together raise a high flag", () => {
    expect(assessSeverity("I want a refund, the item was damaged").level).toBe("high");
  });

  it("an urgent double charge is high at least", () => {
    expect(["high", "critical"]).toContain(assessSeverity("You charged me twice, urgent please").level);
  });

  it("gives readable reasons and none for a clean message", () => {
    expect(assessSeverity("Hello, just saying thanks").reasons).toEqual([]);
    expect(assessSeverity("it is defective").reasons).toContain("Possible product defect or malfunction");
  });

  it("does not match inside other words", () => {
    expect(assessSeverity("The firefox browser and the fireplace page are fine").level).toBe("none");
  });
});

describe("largestAmount", () => {
  it("reads symbols, thousands separators and units", () => {
    expect(largestAmount("₹12,500")).toBe(12500);
    expect(largestAmount("I paid $2k and Rs. 3 lakh")).toBe(300000);
    expect(largestAmount("50000 rupees")).toBe(50000);
    expect(largestAmount("order number 1042")).toBe(0);
  });
});
