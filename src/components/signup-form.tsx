"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, BookOpenCheck, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { signupUser } from "@/lib/auth-actions";

interface SignupFormProps {
  onSignup: (userId: number) => void;
  onSwitchToLogin: () => void;
}

export default function SignupForm({ onSignup, onSwitchToLogin }: SignupFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const result = await signupUser({ name, username, email, password });

    if (result.success && result.userId) {
      toast({ title: "Cadastro realizado com sucesso!" });
      // Reset form
      setName("");
      setUsername("");
      setEmail("");
      setPassword("");
      // Trigger parent action (e.g., close dialog and refresh list)
      onSignup(result.userId);
    } else {
      toast({
        variant: "destructive",
        title: "Falha no Cadastro",
        description: result.error,
      });
    }
    setIsLoading(false);
  };

  return (
    <Card className="w-full z-10 shadow-none border-0">
      <CardHeader className="text-center">
        <div className="mx-auto bg-primary text-primary-foreground p-3 rounded-full w-fit mb-4">
          <UserPlus className="h-8 w-8" />
        </div>
        <CardTitle className="text-2xl font-bold">Criar Novo Usuário</CardTitle>
        <CardDescription>
          Preencha os dados para criar um novo acesso.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome Completo</Label>
            <Input id="name" type="text" placeholder="Nome do Usuário" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
           <div className="space-y-2">
            <Label htmlFor="username-signup">Usuário</Label>
            <Input id="username-signup" type="text" placeholder="login_de_acesso" required value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="usuario@exemplo.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2 relative">
            <Label htmlFor="password-signup">Senha</Label>
            <Input id="password-signup" type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} />
            <button
              type="button"
              className="absolute right-3 top-[2.4rem] text-muted-foreground"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
             <p className='text-xs text-muted-foreground'>A senha deve ter no mínimo 6 caracteres.</p>
          </div>
        </CardContent>
        <CardFooter className="flex-col gap-4">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <UserPlus className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="mr-2 h-4 w-4" />
            )}
            Cadastrar Usuário
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
