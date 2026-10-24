"use client";

import { useState } from "react";

import { GettingStartedCard } from "./getting-started-card";
import { WelcomeTour } from "./welcome-tour";

import { useCurrentUser } from "@/hooks/use-auth";
import { useOnboarding } from "@/hooks/use-onboarding";

/** Shows the tour once per person (first visit) and the live checklist. */
export function OnboardingHost() {
  const { data: user } = useCurrentUser();
  const { state, ready, update } = useOnboarding(user?.id);
  const [replay, setReplay] = useState(false);
  const open = replay || (ready && !state.tourSeen);

  return (
    <>
      <GettingStartedCard onReplayTour={() => setReplay(true)} />
      <WelcomeTour
        open={open}
        name={user?.name}
        onClose={() => {
          setReplay(false);
          update({ tourSeen: true });
        }}
      />
    </>
  );
}
