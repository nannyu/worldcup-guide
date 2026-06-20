"use client";

import dynamic from "next/dynamic";

const TeamCardsScreen = dynamic(
  () => import("@/components/screens/TeamCardsScreen").then((m) => m.TeamCardsScreen),
  { ssr: false },
);

export default function TeamsPage() {
  return <TeamCardsScreen />;
}
