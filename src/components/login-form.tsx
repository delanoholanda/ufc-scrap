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
import { LogIn, BookOpenCheck, Eye, EyeOff, Loader2, MailQuestion } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { loginUser, forgotPassword } from "@/lib/auth-actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface LoginFormProps {
  onLogin: (userId: number) => void;
}

export default function LoginForm({ onLogin }: LoginFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [isForgotPasswordLoading, setIsForgotPasswordLoading] = useState(false);
  const [isForgotDialogOpen, setIsForgotDialogOpen] = useState(false);
  
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const result = await loginUser({ username, password });

    if (result.success && result.userId) {
      toast({ title: "Login bem-sucedido!" });
      onLogin(result.userId);
    } else {
      toast({
        variant: "destructive",
        title: "Falha no Login",
        description: result.error,
      });
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!forgotPasswordEmail) {
        toast({ variant: 'destructive', title: 'Erro', description: 'Por favor, insira um email.'});
        return;
    }
    setIsForgotPasswordLoading(true);
    const result = await forgotPassword(forgotPasswordEmail);
    if (result.success) {
        toast({ title: 'Verifique seu Email', description: result.message });
    } else {
        // Show success message even on failure for security, as per the action's logic
        toast({ title: 'Verifique seu Email', description: result.error });
    }
    setIsForgotPasswordLoading(false);
    setForgotPasswordEmail("");
    setIsForgotDialogOpen(false);
  }

  return (
    <Card className="w-full max-w-md z-10 shadow-2xl">
      <CardHeader className="text-center">
        <div className="mx-auto bg-primary text-primary-foreground p-3 rounded-full w-fit mb-4">
          <BookOpenCheck className="h-8 w-8" />
        </div>
        <CardTitle className="text-2xl font-bold">UFC Data Scraper</CardTitle>
        <CardDescription>
          Faça login com sua conta para continuar.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Usuário</Label>
            <Input id="username" type="text" placeholder="seu_usuario" required value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="space-y-2 relative">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Senha</Label>
               <AlertDialog open={isForgotDialogOpen} onOpenChange={setIsForgotDialogOpen}>
                  <AlertDialogTrigger asChild>
                     <button type="button" className="text-xs text-muted-foreground hover:underline">
                        Esqueceu a senha?
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2">
                        <MailQuestion /> Redefinir Senha
                        </AlertDialogTitle>
                      <AlertDialogDescription>
                        Digite seu email de cadastro para receber as instruções de redefinição de senha.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="forgot-email">Email</Label>
                        <Input
                            id="forgot-email"
                            type="email"
                            placeholder="seu_email@dominio.com"
                            value={forgotPasswordEmail}
                            onChange={(e) => setForgotPasswordEmail(e.target.value)}
                        />
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleForgotPassword} disabled={isForgotPasswordLoading}>
                        {isForgotPasswordLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Enviar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
            </div>
            <Input id="password" type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} />
            <button
              type="button"
              className="absolute right-3 top-[2.4rem] text-muted-foreground"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </CardContent>
        <CardFooter className="flex-col gap-4">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <LogIn className="mr-2 h-4 w-4" />
            )}
            Entrar
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
