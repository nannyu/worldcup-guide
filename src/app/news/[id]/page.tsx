"use client";

import dynamic from "next/dynamic";

const NewsDetailScreen = dynamic(
  () => import("@/components/screens/NewsDetailScreen").then((m) => m.NewsDetailScreen),
  { ssr: false },
);

export default function NewsDetailPage() {
  return <NewsDetailScreen />;
}
