
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
import type { User as UserType } from '@/lib/types';
import { useParams, useRouter } from 'next/navigation';
import MainLayout from '@/components/main-layout';

export default function EditUserPage() {
  const [user, setUser] = useState<Omit<UserType, 'salt' | 'hash'> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  const { toast } = useToast();
  const params = useParams();
  const router = useRouter();
  const userId = Array.isArray(params.id) ? params.id[0] : params.id;

  useEffect(() => {
    const sessionUserId = sessionStorage.getItem("userId");
    if (sessionUserId) {
        setCurrentUserId(parseInt(sessionUserId, 10));
    } else {
        window.location.href = '/'; // Redirect if not logged in
    }

    if (!userId) {
      router.push('/users');
      return;
    }

    async function fetchUser() {
      try {
        const userData = await findUserById(parseInt(userId, 10));
        if (userData) {
          setUser(userData);
          setName(userData.name);
          setUsername(userData.username);
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
  }, [userId, toast, router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSaving(true);

    const result = await updateUserProfile({ userId: user.id, name, username, email, password });

    if (result.success) {
      toast({ title: 'Sucesso', description: 'Perfil do usuário atualizado.' });
      router.push('/users');
    } else {
      toast({ variant: 'destructive', title: 'Erro', description: result.error });
    }
    setIsSaving(false);
  };

  const handleLogout = () => {
    sessionStorage.removeItem("userId");
    window.location.href = '/';
  };

  if (isLoading || !currentUserId || !user) {
    return (
        <div className="flex h-screen w-screen items-center justify-center bg-background">
             <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
    );
  }

  return (
     <MainLayout onLogout={handleLogout} userId={currentUserId}>
         <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <UserIcon />
                        Editando Perfil de {user.name}
                    </h1>
                    <p className="text-muted-foreground">Atualize as informações do usuário abaixo.</p>
                </div>
            </header>
            <Card className="w-full max-w-2xl mt-4">
                <form onSubmit={handleSave}>
                    <CardContent className="space-y-4 pt-6">
                        <div className="space-y-2">
                            <Label htmlFor="name">Nome Completo</Label>
                            <Input id="name" value={name} onChange={e => setName(e.target.value)} required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="username">Nome de Usuário</Label>
                            <Input id="username" value={username} onChange={e => setUsername(e.target.value)} required />
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
