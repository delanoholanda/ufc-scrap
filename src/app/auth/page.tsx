"use client";

import LoginForm from "@/components/login-form";

interface AuthPageProps {
  onLogin: (userId: number) => void;
}

export default function AuthPage({ onLogin }: AuthPageProps) {

  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center bg-background p-4">
      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-primary/10 via-transparent to-accent/10"></div>
       <LoginForm onLogin={onLogin} />
      <footer className="mt-8 text-center text-sm text-muted-foreground z-10">
        <p>&copy; {new Date().getFullYear()} Universidade Federal do Ceará. Todos os direitos reservados.</p>
      </footer>
    </main>
  );
}
