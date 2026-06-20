"use client";

import dynamic from "next/dynamic";

const MorningBriefScreen = dynamic(
  () => import("@/components/screens/MorningBriefScreen").then((m) => m.MorningBriefScreen),
  { ssr: false },
);

export default function MorningPage() {
  return <MorningBriefScreen />;
}
