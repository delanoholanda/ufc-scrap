"use client";

import { LogOut, Settings, User as UserIcon } from "lucide-react";
import ScraperView from "@/components/scraper-view";
import SettingsDialog from "@/components/settings-dialog";
import Link from "next/link";
import MainLayout from "./main-layout";

interface DashboardProps {
  onLogout: () => void;
  userId: number;
}

export default function Dashboard({ onLogout, userId }: DashboardProps) {
  return (
    <MainLayout onLogout={onLogout} userId={userId}>
      <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <ScraperView />
      </main>
    </MainLayout>
  );
}
