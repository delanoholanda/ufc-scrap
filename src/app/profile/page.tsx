"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { findUserById, updateUserProfile } from '@/lib/auth-actions';
import { Skeleton } from '@/components/ui/skeleton';
import { Save, Loader2, Eye, EyeOff, User as UserIcon } from 'lucide-react';
import Link from 'next/link';
import type { User } from '@/lib/types';
import MainLayout from '@/components/main-layout';

export default function ProfilePage() {
  const [user, setUser] = useState<Omit<User, 'salt' | 'hash'> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    const userIdStr = sessionStorage.getItem('userId');
    if (!userIdStr) {
      window.location.href = '/';
      return;
    }
    const userId = parseInt(userIdStr, 10);
    if(isNaN(userId)) {
        window.location.href = '/';
        return;
    }


    async function fetchUser() {
      try {
        const userData = await findUserById(userId);
        if (userData) {
          setUser(userData);
          setEmail(userData.email);
        } else {
            throw new Error("Usuário não encontrado.");
        }
      } catch (e) {
        toast({ variant: 'destructive', title: 'Erro', description: e instanceof Error ? e.message : 'Falha ao carregar dados do usuário.' });
      } finally {
        setIsLoading(false);
      }
    }

    fetchUser();
  }, [toast]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSaving(true);

    const result = await updateUserProfile({ 
      userId: user.id, 
      name: user.name, 
      username: user.username, 
      email, 
      password 
    });

    if (result.success) {
      toast({ title: 'Sucesso', description: 'Perfil atualizado.' });
      setPassword(''); // Clear password field after save
    } else {
      toast({ variant: 'destructive', title: 'Erro', description: result.error });
    }
    setIsSaving(false);
  };

  const handleLogout = () => {
    sessionStorage.removeItem("userId");
    window.location.href = '/';
  };

   if (isLoading || !user) {
    return (
        <div className="flex h-screen w-screen items-center justify-center bg-background">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
    );
  }

  return (
     <MainLayout onLogout={handleLogout} userId={user.id}>
        <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
             <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <UserIcon />
                        Perfil de {user.name}
                    </h1>
                    <p className="text-muted-foreground">Atualize seu email ou senha.</p>
                </div>
            </header>

            <Card className="w-full max-w-2xl mt-4">
                <form onSubmit={handleSave}>
                    <CardContent className="space-y-4 pt-6">
                        <div className="space-y-2">
                            <Label>Nome de Usuário</Label>
                            <Input value={user.username} disabled />
                            <p className='text-xs text-muted-foreground'>O nome de usuário não pode ser alterado.</p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                        </div>
                        <div className="space-y-2 relative">
                            <Label htmlFor="password">Nova Senha</Label>
                            <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Deixe em branco para não alterar" />
                            <button
                                type="button"
                                className="absolute right-3 top-[2.4rem] text-muted-foreground"
                                onClick={() => setShowPassword(!showPassword)}
                                >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                            <p className='text-xs text-muted-foreground'>A senha deve ter no mínimo 6 caracteres.</p>
                        </div>
                        <Button type="submit" disabled={isSaving}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Salvar Alterações
                        </Button>
                    </CardContent>
                </form>
            </Card>
        </div>
     </MainLayout>
  );
}
