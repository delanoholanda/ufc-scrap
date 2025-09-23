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
import { Loader2, Save } from 'lucide-react';
import type { PostgresMatricula } from '@/lib/types';
import { addMatricula, updateMatricula } from '@/lib/matriculas-actions';
import { z } from 'zod';


const MatriculaSchema = z.object({
  matricula: z.preprocess(
    (a) => parseInt(z.string().parse(a), 10),
    z.number().min(1, "Matrícula é obrigatória.")
  ),
  nome: z.string().min(1, 'Nome é obrigatório.'),
  curso: z.string().min(1, 'Curso é obrigatório.'),
  cadastrado: z.preprocess(
    (a) => parseInt(z.string().parse(a), 10),
    z.number().int().min(0).max(1)
  )
});

interface MatriculasDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onMatriculaSaved: () => void;
  matricula?: PostgresMatricula | null;
}

const cursoOptions = [
    "Sistemas de Informação",
    "Redes de Computadores",
    "Engenharia de Software",
    "Engenharia de Computação",
    "Design Digital",
    "Ciência da Computação",
    "Mestrado em Computação",
];

export default function MatriculasDialog({ isOpen, onOpenChange, onMatriculaSaved, matricula }: MatriculasDialogProps) {
  const [formData, setFormData] = useState({
    matricula: '',
    nome: '',
    curso: '',
    cadastrado: '0'
  });
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      if (matricula) {
        setFormData({
          matricula: String(matricula.matricula),
          nome: matricula.nome,
          curso: matricula.curso,
          cadastrado: String(Number(matricula.cadastrado))
        });
      } else {
        setFormData({ matricula: '', nome: '', curso: '', cadastrado: '0' });
      }
    }
  }, [matricula, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };
  
  const handleSelectChange = (name: string, value: string) => {
    setFormData({ ...formData, [name]: value });
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    const validation = MatriculaSchema.safeParse(formData);
    if (!validation.success) {
      toast({
        variant: 'destructive',
        title: 'Erro de Validação',
        description: validation.error.errors.map(err => err.message).join('\n'),
      });
      setIsSaving(false);
      return;
    }
    
    const dataToSave = validation.data;

    try {
      let result;
      if (matricula) {
        // Update
        result = await updateMatricula(matricula.id_matriculas, dataToSave);
      } else {
        // Add
        result = await addMatricula(dataToSave);
      }
      
      if (result.success) {
        toast({ title: 'Sucesso', description: result.message });
        onMatriculaSaved();
        onOpenChange(false);
      } else {
        toast({ variant: 'destructive', title: 'Erro', description: result.error });
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : "Ocorreu um erro desconhecido.";
      toast({ variant: 'destructive', title: 'Erro de Servidor', description: error });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{matricula ? 'Editar Matrícula' : 'Adicionar Matrícula'}</DialogTitle>
          <DialogDescription>
            {matricula ? 'Altere os dados da matrícula abaixo.' : 'Preencha os dados da nova matrícula.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="matricula">Matrícula</Label>
                <Input id="matricula" name="matricula" type="number" value={formData.matricula} onChange={handleChange} required />
            </div>
             <div className="space-y-2">
                <Label htmlFor="nome">Nome</Label>
                <Input id="nome" name="nome" value={formData.nome} onChange={handleChange} required />
            </div>
             <div className="space-y-2">
                <Label htmlFor="curso">Curso</Label>
                <Select name="curso" value={formData.curso} onValueChange={(value) => handleSelectChange('curso', value)} required>
                    <SelectTrigger>
                        <SelectValue placeholder="Selecione um curso" />
                    </SelectTrigger>
                    <SelectContent>
                        {cursoOptions.map(option => (
                             <SelectItem key={option} value={option.toUpperCase()}>{option}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            {matricula && (
              <div className="space-y-2">
                  <Label htmlFor="cadastrado">Cadastrado</Label>
                   <Select name="cadastrado" value={formData.cadastrado} onValueChange={(value) => handleSelectChange('cadastrado', value)} required>
                      <SelectTrigger>
                          <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                          <SelectItem value="0">Não</SelectItem>
                           <SelectItem value="1">Sim</SelectItem>
                      </SelectContent>
                  </Select>
              </div>
            )}
            <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                    Cancelar
                </Button>
                <Button type="submit" disabled={isSaving}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Salvar
                </Button>
            </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
