/**
 * The AI service answers with a fixed sentence when the knowledge base has
 * nothing relevant (see FALLBACK_REPLY in apps/ai-service/.../suggest_reply.py).
 * Matching on this prefix is how traces and evals tell "the AI declined to
 * answer" apart from "the AI answered".
 */
export const FALLBACK_REPLY_PREFIX = "i'm sorry, but i couldn't find this information";

export function isFallbackReply(reply: string): boolean {
  return reply.trim().toLowerCase().replace(/\s+/g, " ").startsWith(FALLBACK_REPLY_PREFIX);
}
