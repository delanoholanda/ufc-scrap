"use client";

import { useState, useEffect, useTransition } from 'react';
import { useDebounce } from 'use-debounce';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import type { LdapUser } from '@/lib/types';
import { fetchLdapUsers, updateLdapUserStatus } from '@/lib/ldap-actions';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Search, Loader2, AlertCircle, Users, GraduationCap, Edit } from 'lucide-react';
import MainLayout from '@/components/main-layout';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import LdapUserDialog from '@/components/ldap-user-dialog';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';

export default function LdapAlunosPage() {
  const [users, setUsers] = useState<LdapUser[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, startTransition] = useTransition();
  const [editingUserDn, setEditingUserDn] = useState<string | null>(null);
  const [updatingStatusDn, setUpdatingStatusDn] = useState<string | null>(null);
  
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { replace } = useRouter();
  
  const currentPage = Number(searchParams.get('page')) || 1;
  const searchTerm = searchParams.get('search') || '';
  const searchField = searchParams.get('field') || 'uid';
  const statusFilter = searchParams.get('status') || 'ativo';
  const itemsPerPage = Number(searchParams.get('perPage')) || 10;
  const [debouncedSearchTerm] = useDebounce(searchTerm, 500);

  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const { toast } = useToast();
  

  useEffect(() => {
    const sessionUserId = sessionStorage.getItem("userId");
    if (sessionUserId) {
        setCurrentUserId(parseInt(sessionUserId, 10));
    } else {
        window.location.href = '/';
    }
  }, []);

  const loadUsers = () => {
    startTransition(async () => {
      try {
        const result = await fetchLdapUsers({
            page: currentPage,
            perPage: itemsPerPage,
            searchField: searchField,
            searchValue: debouncedSearchTerm,
            status: statusFilter === 'todos' ? undefined : (statusFilter as 'ativo' | 'inativo'),
            baseFilter: '(objectClass=alunoUFCQuixada)', // Filter for students
        });
        if (result.success && result.users) {
            setUsers(result.users);
            setTotal(result.total || 0);
        } else {
            setUsers([]);
            setTotal(0);
            toast({ variant: 'destructive', title: 'Erro ao buscar no LDAP', description: result.error });
        }
      } catch (e) {
          const error = e instanceof Error ? e.message : 'Falha ao buscar usuários LDAP.';
          toast({ variant: 'destructive', title: 'Erro de Conexão', description: error });
      }
    });
  }

  useEffect(() => {
    if (currentUserId !== null) {
      loadUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, currentPage, debouncedSearchTerm, searchField, itemsPerPage, statusFilter]);
  
  const handleUrlParamChange = (param: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', '1'); // Reset page on filter change
    if (value) {
        params.set(param, value);
    } else {
        params.delete(param);
    }
    replace(`${pathname}?${params.toString()}`);
  }

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams);
    if (page > 0 && page !== currentPage) {
      params.set('page', page.toString());
       replace(`${pathname}?${params.toString()}`);
    }
  }

  const handleLogout = () => {
    sessionStorage.removeItem("userId");
    window.location.href = '/';
  };
  
  const totalPages = Math.ceil(total / itemsPerPage);

  const getPaginationItems = () => {
    const items = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) {
        items.push(i);
      }
    } else {
      if (currentPage <= 3) {
        items.push(1, 2, 3, 4, 5);
      } else if (currentPage >= totalPages - 2) {
        items.push(totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        items.push(currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2);
      }
    }
    return items.filter(p => p > 0 && p <= totalPages);
  }

  const handleEditClick = (dn: string) => {
    setEditingUserDn(dn);
  }
  
  const handleDialogClose = (refresh: boolean) => {
      setEditingUserDn(null);
      if (refresh) {
          loadUsers();
      }
  }

  const handleStatusChange = async (dn: string, newStatus: 'ativo' | 'inativo') => {
      setUpdatingStatusDn(dn);
      const result = await updateLdapUserStatus(dn, newStatus);
      if (result.success) {
          toast({ title: 'Sucesso', description: 'Status do usuário atualizado.' });
          setUsers(users.map(u => u.dn === dn ? { ...u, status: newStatus } : u));
      } else {
          toast({ variant: 'destructive', title: 'Erro', description: result.error });
      }
      setUpdatingStatusDn(null);
  };

  const searchPlaceholders: { [key: string]: string } = {
    uid: 'Buscar por UID (CPF)...',
    matricula: 'Buscar por Matrícula...',
    mail: 'Buscar por Email...',
  };

  if (!currentUserId) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <MainLayout onLogout={handleLogout} userId={currentUserId}>
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
                 <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <Users />
                        Gerenciamento de Usuários LDAP
                    </h1>
                     {!isLoading && (
                        <Badge variant="secondary" className="whitespace-nowrap">Total: {total} Alunos</Badge>
                     )}
                 </div>
                <p className="text-muted-foreground">Consulte, adicione, edite e remova usuários do diretório LDAP.</p>
            </div>
             <nav className="flex items-center gap-2">
                <Button asChild variant={pathname.endsWith('/alunos') ? 'default' : 'outline'}>
                    <Link href="/ldap/alunos"><GraduationCap className="mr-2 h-4 w-4" /> Alunos</Link>
                </Button>
                <Button asChild variant={pathname.endsWith('/servidores') ? 'default' : 'outline'}>
                     <Link href="/ldap/servidores"><Users className="mr-2 h-4 w-4" /> Servidores</Link>
                </Button>
            </nav>
        </header>

         <Card>
          <CardContent className='pt-6'>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 items-end">
                 <div className="space-y-2">
                    <Label htmlFor="search-field">Buscar por</Label>
                    <Select value={searchField} onValueChange={(v) => handleUrlParamChange('field', v)}>
                        <SelectTrigger id="search-field">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="uid">UID (CPF)</SelectItem>
                            <SelectItem value="matricula">Matrícula</SelectItem>
                            <SelectItem value="mail">Email</SelectItem>
                        </SelectContent>
                    </Select>
                 </div>
                <div className="relative md:col-span-2">
                   <Label htmlFor="search-input">Termo de Busca</Label>
                  <Search className="absolute left-3 top-[2.4rem] h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search-input"
                    placeholder={searchPlaceholders[searchField] || 'Buscar...'}
                    className="pl-9"
                    onChange={(e) => handleUrlParamChange('search', e.target.value)}
                    defaultValue={searchTerm}
                  />
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="status-filter">Status</Label>
                    <Select value={statusFilter} onValueChange={(v) => handleUrlParamChange('status', v)}>
                        <SelectTrigger id="status-filter">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="todos">Todos</SelectItem>
                            <SelectItem value="ativo">Ativo</SelectItem>
                            <SelectItem value="inativo">Inativo</SelectItem>
                        </SelectContent>
                    </Select>
                 </div>
                 <div className="space-y-2">
                    <Label htmlFor="items-per-page">Itens por página</Label>
                     <Select value={String(itemsPerPage)} onValueChange={(v) => handleUrlParamChange('perPage', v)}>
                        <SelectTrigger id="items-per-page">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="10">10</SelectItem>
                            <SelectItem value="25">25</SelectItem>
                            <SelectItem value="50">50</SelectItem>
                            <SelectItem value="100">100</SelectItem>
                        </SelectContent>
                    </Select>
                 </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="flex-1">
          <CardContent className="pt-6">
             {isLoading ? (
              <div className="flex justify-center items-center h-64">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : users.length === 0 ? (
               <div className="text-center py-16">
                  <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-medium">Nenhum aluno encontrado</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Tente ajustar sua busca ou adicione um novo aluno.
                  </p>
                </div>
            ) : (
              <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>UID (CPF)</TableHead>
                      <TableHead>Nome Completo</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Matrícula</TableHead>
                      <TableHead>Curso</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right pr-6">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map(u => (
                      <TableRow key={u.dn}>
                        <TableCell className="font-medium">{u.uid}</TableCell>
                        <TableCell>{u.nomecompleto}</TableCell>
                        <TableCell>{u.mail}</TableCell>
                        <TableCell>{u.matricula}</TableCell>
                        <TableCell>{u.curso}</TableCell>
                        <TableCell>
                          <Switch
                            checked={u.status === 'ativo'}
                            onCheckedChange={(checked) => handleStatusChange(u.dn, checked ? 'ativo' : 'inativo')}
                            disabled={updatingStatusDn === u.dn}
                            aria-label={`Status do usuário ${u.nomecompleto}`}
                          />
                        </TableCell>
                        <TableCell className="text-right space-x-2 pr-6">
                           <Button variant="outline" size="icon" onClick={() => handleEditClick(u.dn)}>
                                <Edit className="h-4 w-4" />
                           </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
               <Pagination className='mt-6'>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); if(currentPage > 1) handlePageChange(currentPage - 1)}} className={currentPage === 1 ? 'pointer-events-none opacity-50' : ''} />
                    </PaginationItem>
                    
                    {getPaginationItems().map(page => (
                        <PaginationItem key={page}>
                            <PaginationLink href="#" onClick={(e) => { e.preventDefault(); handlePageChange(page); }} isActive={page === currentPage}>{page}</PaginationLink>
                        </PaginationItem>
                    ))}

                    {totalPages > 5 && currentPage < totalPages - 2 && (
                       <PaginationItem>
                         <PaginationEllipsis />
                       </PaginationItem>
                    )}
                    
                    <PaginationItem>
                      <PaginationNext href="#" onClick={(e) => { e.preventDefault(); if(currentPage < totalPages) handlePageChange(currentPage + 1)}} className={currentPage === totalPages ? 'pointer-events-none opacity-50' : ''} />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </>
            )}
          </CardContent>
        </Card>

      </div>
      {editingUserDn && (
        <LdapUserDialog 
            isOpen={!!editingUserDn}
            onOpenChange={(open) => !open && handleDialogClose(false)}
            onUserSaved={() => handleDialogClose(true)}
            userDn={editingUserDn}
        />
      )}
    </MainLayout>
  );
}

    
    