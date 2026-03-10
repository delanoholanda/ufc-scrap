
"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from '@/hooks/use-toast';
import { findLdapUserByDn, updateLdapUser } from '@/lib/ldap-actions';
import { Save, Loader2, User as UserIcon, Eye, EyeOff, AlertCircle } from 'lucide-react';
import type { LdapUser } from '@/lib/types';
import { Skeleton } from './ui/skeleton';

interface LdapUserDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onUserSaved: () => void;
  userDn: string | null;
}

export default function LdapUserDialog({ isOpen, onOpenChange, onUserSaved, userDn }: LdapUserDialogProps) {
  const [user, setUser] = useState<LdapUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({
      nomecompleto: '',
      mail: '',
      status: '',
      matricula: '',
      curso: '',
      cargo: '',
      userPassword: '',
  });
  
  const { toast } = useToast();

  useEffect(() => {
    async function fetchUser() {
        if (!userDn) return;
        try {
            const result = await findLdapUserByDn(userDn);
            if (result.success && result.user) {
                setUser(result.user);
                setFormData({
                    nomecompleto: result.user.nomecompleto || '',
                    mail: result.user.mail || '',
                    status: result.user.status || 'ativo',
                    matricula: result.user.matricula || '',
                    curso: result.user.curso || '',
                    cargo: result.user.cargo || '',
                    userPassword: '', 
                });
            } else {
                throw new Error(result.error || "Usuário LDAP não encontrado.");
            }
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'Falha ao carregar dados do usuário LDAP.';
            setError(errorMessage);
            toast({ variant: 'destructive', title: 'Erro', description: errorMessage });
        } finally {
            setIsLoading(false);
        }
    }

    if (isOpen && userDn) {
        setIsLoading(true);
        setError(null);
        setUser(null);
        fetchUser();
    }
  }, [isOpen, userDn, toast]);
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };
  
  const handleSelectChange = (name: string, value: string) => {
    setFormData({ ...formData, [name]: value });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userDn || !user) return;
    setIsSaving(true);
    
    // Filtra atributos baseados no tipo de usuário e envia apenas o que mudou
    const dataToUpdate: any = {};
    const original = user;

    if (formData.nomecompleto !== (original.nomecompleto || '')) {
        dataToUpdate.nomecompleto = formData.nomecompleto;
        
        // Sincroniza CN (Primeiro Nome) e SN (Sobrenome/Restante)
        const nameParts = formData.nomecompleto.trim().split(/\s+/);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || firstName;
        
        dataToUpdate.cn = firstName.toUpperCase();
        dataToUpdate.sn = lastName.toUpperCase();
    }
    
    if (formData.mail !== (original.mail || '')) {
        dataToUpdate.mail = formData.mail;
    }
    
    if (formData.status !== (original.status || 'ativo')) {
        dataToUpdate.status = formData.status;
    }
    
    if (formData.userPassword) {
        dataToUpdate.userPassword = formData.userPassword;
    }

    // Campos específicos de Aluno
    if (!!original.matricula || formData.matricula) {
        if (formData.matricula !== (original.matricula || '')) {
            dataToUpdate.matricula = formData.matricula;
        }
        if (formData.curso !== (original.curso || '')) {
            dataToUpdate.curso = formData.curso;
        }
    }

    // Campos específicos de Servidor
    if (!!original.siape || !!original.cargo) {
        if (formData.cargo !== (original.cargo || '')) {
            dataToUpdate.cargo = formData.cargo;
        }
    }

    if (Object.keys(dataToUpdate).length === 0) {
        toast({ title: 'Informação', description: 'Nenhuma alteração detectada.' });
        setIsSaving(false);
        onOpenChange(false);
        return;
    }

    const result = await updateLdapUser(userDn, dataToUpdate);

    if (result.success) {
      toast({ title: 'Sucesso', description: 'Usuário LDAP atualizado.' });
      onUserSaved();
      onOpenChange(false);
    } else {
      toast({ variant: 'destructive', title: 'Erro ao Atualizar', description: result.error });
    }
    setIsSaving(false);
  };

  const isAluno = !!user?.matricula;
  const isServidor = !!user?.siape || (!user?.matricula && !!user?.cargo);

  const renderLoading = () => (
    <div className="space-y-4 pt-4">
        <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-10 w-full" />
        </div>
         <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-10 w-full" />
        </div>
         <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-10 w-full" />
        </div>
         <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-10 w-full" />
        </div>
    </div>
  );

  const renderError = () => (
      <div className="flex flex-col items-center justify-center h-64 text-destructive">
          <AlertCircle className="h-8 w-8 mb-2" />
          <p className="text-center">{error}</p>
      </div>
  )

  const renderForm = () => (
     <form onSubmit={handleSave}>
        <div className="max-h-[60vh] overflow-y-auto px-1 pr-3">
            <div className="space-y-4 pt-4">
                <div className="space-y-2">
                    <Label htmlFor="uid">UID (CPF)</Label>
                    <Input id="uid" value={user?.uid || ''} disabled className="bg-muted" />
                    <p className='text-xs text-muted-foreground'>O UID (CPF) não pode ser alterado.</p>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="nomecompleto">Nome Completo</Label>
                    <Input id="nomecompleto" name="nomecompleto" value={formData.nomecompleto} onChange={handleChange} required />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="mail">Email</Label>
                    <Input id="mail" name="mail" type="email" value={formData.mail} onChange={handleChange} required />
                </div>

                <div className="space-y-2 relative">
                    <Label htmlFor="userPassword">Nova Senha</Label>
                    <Input id="userPassword" name="userPassword" type={showPassword ? "text" : "password"} value={formData.userPassword} onChange={handleChange} placeholder="Deixe em branco para não alterar" />
                    <button
                        type="button"
                        className="absolute right-3 top-[2.4rem] text-muted-foreground"
                        onClick={() => setShowPassword(!showPassword)}
                        >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                </div>

                {isAluno && (
                    <>
                    <div className="space-y-2">
                        <Label htmlFor="matricula">Matrícula</Label>
                        <Input id="matricula" name="matricula" value={formData.matricula} onChange={handleChange} required />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="curso">Curso</Label>
                        <Input id="curso" name="curso" value={formData.curso} onChange={handleChange} required />
                    </div>
                    </>
                )}

                {isServidor && (
                    <div className="space-y-2">
                        <Label htmlFor="cargo">Cargo</Label>
                        <Input id="cargo" name="cargo" value={formData.cargo} onChange={handleChange} />
                    </div>
                )}

                <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                        <Select name="status" value={formData.status} onValueChange={(value) => handleSelectChange('status', value)} required>
                        <SelectTrigger>
                            <SelectValue placeholder="Selecione um status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ativo">Ativo</SelectItem>
                            <SelectItem value="inativo">Inativo</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
        </div>

        <DialogFooter className="pt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                Cancelar
            </Button>
            <Button type="submit" disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar Alterações
            </Button>
        </DialogFooter>
    </form>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserIcon /> Editando Usuário LDAP
          </DialogTitle>
          {!isLoading && !error && (
            <DialogDescription>
              Atualize as informações de <span className='font-semibold'>{user?.nomecompleto}</span>.
            </DialogDescription>
          )}
        </DialogHeader>
        {isLoading ? renderLoading() : error ? renderError() : renderForm()}
      </DialogContent>
    </Dialog>
  );
}
