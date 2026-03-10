
"use client";

import { useState, useEffect } from "react";
import Dashboard from "@/components/dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import AuthPage from "./auth/page";
import { checkAuth } from "@/lib/auth-actions";

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<number | null>(null);

  useEffect(() => {
    async function validateSession() {
      const id = await checkAuth();
      if (id) {
        setIsAuthenticated(true);
        setUserId(id);
      } else {
        setIsAuthenticated(false);
        setUserId(null);
      }
      setIsLoading(false);
    }
    validateSession();
  }, []);

  const handleLogin = (id: number) => {
    setIsAuthenticated(true);
    setUserId(id);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUserId(null);
    window.location.href = '/';
  };

  if (isLoading) {
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
