"use client";

import { useState, useEffect } from "react";
import Dashboard from "@/components/dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import AuthPage from "./auth/page";

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);

  useEffect(() => {
    setIsClient(true);
    const sessionUserId = sessionStorage.getItem("userId");
    if (sessionUserId) {
      setIsAuthenticated(true);
      setUserId(parseInt(sessionUserId, 10));
    }
  }, []);

  const handleLogin = (id: number) => {
    sessionStorage.setItem("userId", id.toString());
    setIsAuthenticated(true);
    setUserId(id);
  };

  const handleLogout = () => {
    sessionStorage.removeItem("userId");
    setIsAuthenticated(false);
    setUserId(null);
    window.location.href = '/'; // Redirect to auth page
  };

  if (!isClient) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center space-y-4">
          <Skeleton className="h-32 w-96 rounded-lg" />
          <Skeleton className="h-10 w-80 rounded-md" />
          <Skeleton className="h-10 w-80 rounded-md" />
          <Skeleton className="h-10 w-32 rounded-md" />
        </div>
      </div>
    );
  }

  return (
    <>
      {isAuthenticated && userId ? (
        <Dashboard onLogout={handleLogout} userId={userId} />
      ) : (
        <AuthPage onLogin={handleLogin} />
      )}
    </>
  );
}
