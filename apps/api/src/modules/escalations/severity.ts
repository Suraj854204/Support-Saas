/**
 * Plain, explainable rules that decide whether a customer's message is a serious
 * matter (suspected defect, safety, legal/fraud, large money) that a person should
 * contact within 24 hours. Deliberately keyword-based: it is fast, free, works in
 * English and Hinglish, and every flag comes with a readable reason. It errs on the
 * side of flagging, because a missed serious case costs more than a quick check.
 */

export type SeverityLevel = "none" | "high" | "critical";
export interface Severity {
  level: SeverityLevel;
  reasons: string[];
}

interface Rule {
  reason: string;
  weight: 1 | 2 | 3;
  test: RegExp;
}

const RULES: Rule[] = [
  // weight 3 = serious on its own
  { reason: "Possible product defect or malfunction", weight: 3, test: /\b(defect(ive|ed|s)?|faulty|malfunction(ing|ed|s)?|manufactur(ing|er) (fault|defect)|kharab|kharaab|kaam nahi kar raha)\b/i },
  { reason: "Possible safety risk or injury", weight: 3, test: /\b(fire|smoke|smoking|burn(t|ing|ed)?|sparks?|electric shock|shock|explod(e|ed|ing)|explosion|injur(y|ed)|hurt|unsafe|hazard(ous)?|allerg(ic|y)|poison(ed|ing)?|choking|overheat(ed|ing)?|jal gaya|aag)\b/i },
  { reason: "Legal or regulator wording", weight: 3, test: /\b(lawyer|advocate|legal (action|notice)|court|consumer (court|forum|complaint)|police|fir|sue|suing|lawsuit|ombudsman|regulator)\b/i },
  { reason: "Fraud, scam or unauthorised access", weight: 3, test: /\b(fraud|scam|scammed|cheat(ed|ing)?|dhokha|dhoka|unauthori[sz]ed|hacked|phishing|stolen|chori)\b/i },
  { reason: "Data leak or privacy breach", weight: 3, test: /\b(data (breach|leak)|leaked|privacy breach|personal data exposed)\b/i },
  // weight 2 = strong signal
  { reason: "Payment dispute (double charge or chargeback)", weight: 2, test: /\b(charged (me )?(twice|two times|double)|double charge[d]?|duplicate (charge|payment)|chargeback|paisa (kat|cut) gaya|dobara paisa)\b/i },
  { reason: "Customer says it is urgent", weight: 2, test: /\b(urgent(ly)?|asap|immediately|right now|emergency|turant|jaldi|abhi chahiye)\b/i },
  { reason: "Customer threatens to leave or escalate", weight: 2, test: /\b(cancel (my )?(account|subscription|order)|will (leave|switch)|never (buy|order) again|worst|unacceptable|escalate|shikayat|complaint)\b/i },
  // weight 1 = mild; two together raise a flag
  { reason: "Refund or money-back request", weight: 1, test: /\b(refund|money back|paisa wapas|paise wapas|reimburse)\b/i },
  { reason: "Wrong, missing or damaged item", weight: 1, test: /\b(wrong item|not (received|delivered)|missing|damaged|broken|toota|tuta|nahi mila|nahi aaya)\b/i },
  { reason: "Repeated attempts without a fix", weight: 1, test: /\b(again and again|many times|multiple times|several times|still not|no response|no reply|baar baar)\b/i },
];

const LARGE_AMOUNT = 10_000;
const VERY_LARGE_AMOUNT = 50_000;

/** Largest money-looking value in the text: ₹/Rs/INR/$ amounts, plus "lakh"/"crore". */
export function largestAmount(text: string): number {
  let max = 0;
  const money = /(?:₹|rs\.?|inr|\$|usd|eur|€|£)\s*([\d][\d,]*(?:\.\d+)?)(?:\s*(k|lakh|lac|crore|cr|m))?/gi;
  const trailing = /([\d][\d,]*(?:\.\d+)?)\s*(?:₹|rs\b\.?|inr|rupees|dollars|usd)/gi;
  const scale = (unit?: string) => {
    const u = unit?.toLowerCase();
    if (u === "k") return 1_000;
    if (u === "lakh" || u === "lac") return 100_000;
    if (u === "crore" || u === "cr") return 10_000_000;
    if (u === "m") return 1_000_000;
    return 1;
  };
  for (const m of text.matchAll(money)) max = Math.max(max, Number(m[1]!.replace(/,/g, "")) * scale(m[2]));
  for (const m of text.matchAll(trailing)) max = Math.max(max, Number(m[1]!.replace(/,/g, "")));
  return Number.isFinite(max) ? max : 0;
}

export function assessSeverity(text: string): Severity {
  const t = text.slice(0, 20_000);
  const hits = RULES.filter((r) => r.test.test(t));
  let score = hits.reduce((n, r) => n + r.weight, 0);
  const reasons = hits.sort((a, b) => b.weight - a.weight).map((r) => r.reason);

  const amount = largestAmount(t);
  if (amount >= VERY_LARGE_AMOUNT) {
    score += 5; // a very large sum is a critical matter by itself
    reasons.unshift(`Large amount involved (about ${Math.round(amount).toLocaleString("en-IN")})`);
  } else if (amount >= LARGE_AMOUNT) {
    score += 2;
    reasons.push(`Sizeable amount involved (about ${Math.round(amount).toLocaleString("en-IN")})`);
  }

  const hasCritical = hits.some((r) => r.weight === 3);
  if (hasCritical || score >= 5) return { level: "critical", reasons };
  if (score >= 2) return { level: "high", reasons };
  return { level: "none", reasons: [] };
}

export const CONTACT_WINDOW_HOURS = 24;
