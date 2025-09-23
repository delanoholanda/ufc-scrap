"use client";

import { useState, useEffect, useMemo, useTransition } from 'react';
import { useDebounce } from 'use-debounce';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import type { PostgresMatricula } from '@/lib/types';
import { fetchMatriculas, deleteMatricula, processMatriculasCsv } from '@/lib/matriculas-actions';
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
import { Database, Trash2, Edit, PlusCircle, Upload, Search, Loader2, AlertCircle } from 'lucide-react';
import MainLayout from '@/components/main-layout';
import MatriculasDialog from '@/components/matriculas-dialog';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Label } from '@/components/ui/label';

export default function MatriculasPage() {
  const [matriculas, setMatriculas] = useState<PostgresMatricula[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingMatricula, setEditingMatricula] = useState<PostgresMatricula | null>(null);
  
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { replace } = useRouter();
  
  const currentPage = Number(searchParams.get('page')) || 1;
  const searchTerm = searchParams.get('search') || '';
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

  const loadMatriculas = () => {
    startTransition(async () => {
      const result = await fetchMatriculas({
        page: currentPage,
        perPage: itemsPerPage,
        search: debouncedSearchTerm,
      });
      if (result.success && result.matriculas) {
        setMatriculas(result.matriculas);
        setTotal(result.total || 0);
      } else {
        setMatriculas([]);
        setTotal(0);
        toast({ variant: 'destructive', title: 'Erro', description: result.error });
      }
    });
  }

  useEffect(() => {
    if (currentUserId !== null) {
      loadMatriculas();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, currentPage, debouncedSearchTerm, itemsPerPage]);
  
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', '1');
    params.set('search', e.target.value);
    replace(`${pathname}?${params.toString()}`);
  }
  
  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams);
    if (page > 0) {
      params.set('page', page.toString());
    } else {
      params.delete('page');
    }
    replace(`${pathname}?${params.toString()}`);
  }

  const handlePerPageChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', '1');
    params.set('perPage', value);
    replace(`${pathname}?${params.toString()}`);
  };

  const handleDelete = async (id: number) => {
    const result = await deleteMatricula(id);
    if (result.success) {
      toast({ title: 'Sucesso', description: result.message });
      loadMatriculas();
    } else {
      toast({ variant: 'destructive', title: 'Erro ao Excluir', description: result.error });
    }
  };
  
  const handleEdit = (matricula: PostgresMatricula) => {
    setEditingMatricula(matricula);
    setIsAddDialogOpen(true);
  }

  const handleAddNew = () => {
    setEditingMatricula(null);
    setIsAddDialogOpen(true);
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const fileContent = await file.text();
    const result = await processMatriculasCsv(fileContent);

    if (result.success) {
      toast({
        title: "Upload Concluído",
        description: result.message,
      });
      if (result.errors && result.errors.length > 0) {
        console.warn("Erros no CSV:", result.errors);
      }
      loadMatriculas();
    } else {
      toast({
        variant: "destructive",
        title: "Erro no Upload",
        description: result.message,
      });
    }
    setIsUploading(false);
    // Reset file input
    event.target.value = '';
  }


  const handleLogout = () => {
    sessionStorage.removeItem("userId");
    window.location.href = '/';
  };
  
  const totalPages = Math.ceil(total / itemsPerPage);

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
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                    <Database />
                    Gerenciamento de Matrículas (PostgreSQL)
                </h1>
                <p className="text-muted-foreground">Adicione, visualize, edite e remova matrículas do banco de dados.</p>
            </div>
            <div className='flex gap-2 w-full sm:w-auto'>
                 <label htmlFor="csv-upload" className="w-full">
                    <Button asChild className='w-full'>
                      <div>
                        {isUploading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="mr-2 h-4 w-4" />
                        )}
                        {isUploading ? 'Enviando...' : 'Enviar CSV'}
                      </div>
                    </Button>
                    <input id="csv-upload" type="file" className="hidden" accept=".csv" onChange={handleFileUpload} disabled={isUploading} />
                 </label>
                <Button onClick={handleAddNew} className='w-full'>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Adicionar Matrícula
                </Button>
            </div>
        </header>

         <Card>
          <CardContent className='pt-6'>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                <div className="relative sm:col-span-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome ou matrícula..."
                    className="pl-9"
                    onChange={handleSearch}
                    defaultValue={searchTerm}
                  />
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="items-per-page">Itens por página</Label>
                     <Select value={String(itemsPerPage)} onValueChange={handlePerPageChange}>
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
            ) : matriculas.length === 0 ? (
               <div className="text-center py-16">
                  <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-medium">Nenhuma matrícula encontrada</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Tente ajustar sua busca ou adicione uma nova matrícula.
                  </p>
                </div>
            ) : (
              <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Matrícula</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Curso</TableHead>
                      <TableHead>Cadastrado</TableHead>
                      <TableHead>UID Number</TableHead>
                      <TableHead className="text-right pr-6">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matriculas.map(m => (
                      <TableRow key={m.id_matriculas}>
                        <TableCell className="font-medium">{m.matricula}</TableCell>
                        <TableCell>{m.nome}</TableCell>
                        <TableCell>{m.curso}</TableCell>
                        <TableCell>{Number(m.cadastrado) === 1 ? 'Sim' : 'Não'}</TableCell>
                         <TableCell>{m.uidnumber}</TableCell>
                        <TableCell className="text-right space-x-2 pr-6">
                           <Button variant="outline" size="icon" onClick={() => handleEdit(m)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="destructive" size="icon">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta ação não pode ser desfeita. Isso excluirá permanentemente a matrícula de <strong>{m.nome}</strong>.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(m.id_matriculas)}>Continuar</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
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
                    
                     {Array.from({ length: totalPages > 5 ? 5 : totalPages }, (_, i) => {
                        let page = i + 1;
                        if(totalPages > 5 && currentPage > 3) {
                            page = currentPage - 2 + i;
                            if (page > totalPages) return null;
                        }
                        return (
                             <PaginationItem key={page}>
                                <PaginationLink href="#" onClick={(e) => { e.preventDefault(); handlePageChange(page); }} isActive={page === currentPage}>{page}</PaginationLink>
                             </PaginationItem>
                        )
                    })}

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
       <MatriculasDialog 
        isOpen={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onMatriculaSaved={loadMatriculas}
        matricula={editingMatricula}
       />
    </MainLayout>
  );
}
