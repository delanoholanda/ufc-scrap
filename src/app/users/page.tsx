
"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import type { User } from '@/lib/types';
import { fetchAllUsers, deleteUser } from '@/lib/auth-actions';
import { ArrowLeft, Trash2, UserPlus, Users, AlertCircle, Edit, Loader2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import SignupForm from '@/components/signup-form';
import MainLayout from '@/components/main-layout';

type SafeUser = Omit<User, 'salt' | 'hash'>;

export default function UsersPage() {
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  const { toast } = useToast();

   useEffect(() => {
    const sessionUserId = sessionStorage.getItem("userId");
    if (sessionUserId) {
        setCurrentUserId(parseInt(sessionUserId, 10));
    } else {
        window.location.href = '/'; // Redirect if not logged in
    }
  }, []);

  const loadUsers = async () => {
    setIsLoading(true);
    const result = await fetchAllUsers();
    if (result.success && result.users) {
      setUsers(result.users);
    } else {
      toast({ variant: 'destructive', title: 'Erro', description: result.error });
    }
    setIsLoading(false);
  };
  
  useEffect(() => {
      if (currentUserId !== null) {
          loadUsers();
      }
  }, [currentUserId]);

  const handleDelete = async (id: number) => {
    if (id === currentUserId) {
        toast({ variant: 'destructive', title: 'Ação Inválida', description: 'Você não pode excluir a si mesmo.' });
        return;
    }
    const result = await deleteUser(id);
    if (result.success) {
        toast({ title: 'Sucesso', description: 'Usuário excluído.' });
        setUsers(prev => prev.filter(user => user.id !== id));
    } else {
        toast({ variant: 'destructive', title: 'Erro ao Excluir', description: result.error });
    }
  };

  const handleSignup = () => {
    setIsAddUserOpen(false); // Close the dialog
    loadUsers(); // Refresh the user list
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const handleLogout = () => {
    sessionStorage.removeItem("userId");
    window.location.href = '/';
  };

  if (isLoading || !currentUserId) {
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
                        <Users />
                        Gerenciamento de Usuários
                    </h1>
                    <p className="text-muted-foreground">Adicione, visualize, edite e remova usuários do sistema.</p>
                </div>
                <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <UserPlus className="mr-2 h-4 w-4" />
                            Adicionar Usuário
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[480px]">
                        <DialogHeader>
                            <DialogTitle>Criar Novo Usuário</DialogTitle>
                            <DialogDescription>
                                Preencha os dados para criar um novo acesso.
                            </DialogDescription>
                        </DialogHeader>
                    <SignupForm onSignup={handleSignup} onSwitchToLogin={() => setIsAddUserOpen(false)} />
                    </DialogContent>
                </Dialog>
            </header>

            {users.length === 0 && !isLoading ? (
                <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-8 text-center mt-8">
                <AlertCircle className="h-12 w-12 text-muted-foreground" />
                 <p className="text-xl font-medium">Nenhum usuário encontrado.</p>
                </div>
            ) : isLoading ? (
                 <div className="rounded-md border mt-4">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nome</TableHead>
                                <TableHead>Usuário</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Data de Criação</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {[...Array(5)].map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                                    <TableCell className="text-right space-x-2">
                                        <Skeleton className="h-8 w-8 inline-block" />
                                        <Skeleton className="h-8 w-8 inline-block" />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            ) : (
                <div className="rounded-md border mt-4">
                <Table>
                    <TableHeader>
                    <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Usuário</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Data de Criação</TableHead>
                        <TableHead className="text-right pr-6">Ações</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {users.map(user => (
                        <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.name}</TableCell>
                        <TableCell>{user.username}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>{formatDate(user.createdAt)}</TableCell>
                        <TableCell className="text-right space-x-2 pr-6">
                            <Link href={`/users/${user.id}`} passHref>
                                <Button variant="outline" size="icon" aria-label="Editar">
                                    <Edit className="h-4 w-4" />
                                </Button>
                            </Link>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive" size="icon" aria-label="Excluir" disabled={user.id === currentUserId}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                    <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Esta ação não pode ser desfeita. Isso excluirá permanentemente o usuário <strong>{user.name}</strong>.
                                    </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDelete(user.id)}>Continuar</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </TableCell>
                        </TableRow>
                    ))}
                    </TableBody>
                </Table>
                </div>
            )}
        </div>
     </MainLayout>
  );
}
