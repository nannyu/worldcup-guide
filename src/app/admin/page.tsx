"use client";

import dynamic from "next/dynamic";

const AdminPanelScreen = dynamic(
  () => import("@/components/screens/AdminPanelScreen").then((m) => m.AdminPanelScreen),
  { ssr: false },
);

export default function AdminPage() {
  return <AdminPanelScreen />;
}
