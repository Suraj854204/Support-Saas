import { isFallbackReply } from "./fallback";

export interface EvalCaseSpec {
  expectedKeywords: string[];
  forbiddenKeywords: string[];
  expectFallback: boolean;
}

export interface EvalVerdict {
  passed: boolean;
  reasons: string[];
}

function includesCI(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.trim().toLowerCase());
}

/**
 * Deterministic pass/fail for one eval case. Deliberately simple and
 * explainable — keyword checks a support lead can read and edit — rather than
 * another LLM grading the first one, so a failing case always says exactly why.
 *
 *  - expectFallback: the question is out of scope; the right behaviour is to
 *    decline. Passes only if the AI declined.
 *  - otherwise: the AI must actually answer (not decline), must mention every
 *    expected keyword, and must not mention any forbidden one (e.g. a wrong
 *    refund window, a competitor's name, an invented policy).
 */
export function scoreCase(spec: EvalCaseSpec, reply: string): EvalVerdict {
  const declined = isFallbackReply(reply);

  if (spec.expectFallback) {
    return declined
      ? { passed: true, reasons: [] }
      : { passed: false, reasons: ["Expected the AI to decline (out of scope) but it produced an answer"] };
  }

  const reasons: string[] = [];

  if (declined) reasons.push("AI declined to answer (no relevant knowledge-base content found)");

  if (!declined) {
    for (const keyword of spec.expectedKeywords) {
      if (!includesCI(reply, keyword)) reasons.push(`Missing expected keyword: "${keyword}"`);
    }
    for (const keyword of spec.forbiddenKeywords) {
      if (includesCI(reply, keyword)) reasons.push(`Contains forbidden keyword: "${keyword}"`);
    }
  }

  return { passed: reasons.length === 0, reasons };
}
