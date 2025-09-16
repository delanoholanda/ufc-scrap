"use client";

import { Button } from "@/components/ui/button";
import { LogOut, Settings, BookOpenCheck, User as UserIcon, History, Users } from "lucide-react";
import ScraperView from "@/components/scraper-view";
import SettingsDialog from "@/components/settings-dialog";
import Link from "next/link";

interface DashboardProps {
  onLogout: () => void;
  userId: number;
}

export default function Dashboard({ onLogout, userId }: DashboardProps) {
  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-card px-4 sm:px-6">
        <div className="flex items-center gap-2">
            <BookOpenCheck className="h-6 w-6 text-primary" />
            <h1 className="text-lg font-semibold">UFC Data Scraper</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/history" passHref>
            <Button variant="outline" size="icon" aria-label="Histórico">
                <History className="h-4 w-4" />
             </Button>
          </Link>
           <Link href="/users" passHref>
            <Button variant="outline" size="icon" aria-label="Gerenciar Usuários">
                <Users className="h-4 w-4" />
             </Button>
          </Link>
          <Link href="/profile" passHref>
             <Button variant="outline" size="icon" aria-label="Profile">
                <UserIcon className="h-4 w-4" />
             </Button>
          </Link>
          <SettingsDialog />
          <Button variant="outline" size="icon" onClick={onLogout} aria-label="Logout">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <ScraperView />
      </main>
    </div>
  );
}
