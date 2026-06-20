"use client";

import dynamic from "next/dynamic";

const ToolsScreen = dynamic(
  () => import("@/components/screens/ToolsScreen").then((m) => m.ToolsScreen),
  { ssr: false },
);

export default function ToolsPage() {
  return <ToolsScreen />;
}
