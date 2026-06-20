"use client";

import dynamic from "next/dynamic";

const RadarEyeScreen = dynamic(
  () => import("@/components/screens/RadarEyeScreen").then((m) => m.RadarEyeScreen),
  { ssr: false },
);

export default function RadarPage() {
  return <RadarEyeScreen />;
}
