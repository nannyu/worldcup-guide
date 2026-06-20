"use client";

import dynamic from "next/dynamic";

const MatchDetailScreen = dynamic(
  () => import("@/components/screens/MatchDetailScreen").then((m) => m.MatchDetailScreen),
  { ssr: false },
);

export default function MatchDetailPage() {
  return <MatchDetailScreen />;
}
