"use client";

import { useCallback, useEffect, useState } from "react";

export interface OnboardingState {
  tourSeen: boolean;
  checklistDismissed: boolean;
  guideRead: boolean;
  celebrated: boolean;
}

const DEFAULT: OnboardingState = { tourSeen: false, checklistDismissed: false, guideRead: false, celebrated: false };
const EVENT = "loop:onboarding-change";

function key(userId: string) {
  return `loop:onboarding:${userId}`;
}

function read(userId: string): OnboardingState {
  try {
    const raw = window.localStorage.getItem(key(userId));
    return raw ? { ...DEFAULT, ...(JSON.parse(raw) as Partial<OnboardingState>) } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

/**
 * Per-person onboarding flags kept in this browser only. Storage can be blocked
 * or empty, so everything falls back to defaults and never throws.
 */
export function useOnboarding(userId: string | undefined) {
  const [state, setState] = useState<OnboardingState>(DEFAULT);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setState(read(userId));
    setReady(true);
    const sync = () => setState(read(userId));
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, [userId]);

  const update = useCallback(
    (patch: Partial<OnboardingState>) => {
      if (!userId) return;
      const next = { ...read(userId), ...patch };
      try {
        window.localStorage.setItem(key(userId), JSON.stringify(next));
      } catch {
        /* storage unavailable: keep in memory only */
      }
      setState(next);
      window.dispatchEvent(new Event(EVENT));
    },
    [userId]
  );

  return { state, ready, update };
}
