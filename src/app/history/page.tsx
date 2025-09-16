"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import type { Extraction, CSVFile, ExtractionStatus } from '@/lib/types';
import { fetchExtractions, fetchExtractionDetails, deleteExtraction, reprocessExtraction } from '@/lib/history-actions';
import { ArrowLeft, Trash2, ChevronDown, History as HistoryIcon, AlertCircle, FileText, Download, RefreshCw, Loader2, Eye, CheckCircle, XCircle, AlertTriangle, Terminal } from 'lucide-react';
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
} from "@/components/ui/alert-dialog"
import CSVPreviewDialog from '@/components/csv-preview-dialog';
import LogPreviewDialog from '@/components/log-preview-dialog';
import { cn } from '@/lib/utils';


interface EnrichedExtraction extends Extraction {
    files?: CSVFile[];
}

const statusConfig: Record<ExtractionStatus, { text: string; icon: React.FC<any>, className: string }> = {
    completed: { text: 'Concluído', icon: CheckCircle, className: 'bg-green-500 hover:bg-green-600' },
    running: { text: 'Em Execução', icon: Loader2, className: 'bg-blue-500 hover:bg-blue-600 animate-pulse' },
    failed: { text: 'Falhou', icon: XCircle, className: 'bg-red-500 hover:bg-red-600' },
    cancelled: { text: 'Cancelado', icon: AlertTriangle, className: 'bg-yellow-500 hover:bg-yellow-600' },
};


export default function HistoryPage() {
  const [extractions, setExtractions] = useState<EnrichedExtraction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [openAccordionItem, setOpenAccordionItem] = useState<string | null>(null);
  const [isReprocessing, setIsReprocessing] = useState<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    async function loadExtractions() {
      setIsLoading(true);
      const result = await fetchExtractions();
      if (result.success && result.data) {
        // Fetch details for each extraction initially
        const detailedExtractions = await Promise.all(result.data.map(async (ext) => {
            const details = await fetchExtractionDetails(ext.id);
            return { ...ext, files: details.files || [] };
        }));
        setExtractions(detailedExtractions);
      } else {
        toast({ variant: 'destructive', title: 'Erro', description: result.error });
      }
      setIsLoading(false);
    }
    loadExtractions();
  }, [toast]);

  const handleDelete = async (id: number) => {
    const result = await deleteExtraction(id);
    if (result.success) {
        toast({ title: 'Sucesso', description: 'Extração excluída.' });
        setExtractions(prev => prev.filter(ext => ext.id !== id));
    } else {
        toast({ variant: 'destructive', title: 'Erro', description: result.error });
    }
  };

  const handleReprocess = async (id: number) => {
    setIsReprocessing(id);
    const result = await reprocessExtraction(id);
    if (result.success && result.files) {
        toast({ title: 'Sucesso', description: 'Dados reprocessados e arquivos atualizados.' });
        // Update the files for the specific extraction
        setExtractions(prev => prev.map(ext => 
            ext.id === id ? { ...ext, files: result.files, status: 'completed' } : ext
        ));
    } else {
        toast({ variant: 'destructive', title: 'Erro no Reprocessamento', description: result.error });
        // Also update status to failed if reprocessing fails
        setExtractions(prev => prev.map(ext =>
            ext.id === id ? { ...ext, status: 'failed' } : ext
        ));
    }
    setIsReprocessing(null);
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };
  
  const downloadFile = (file: CSVFile) => {
    const bom = '\uFEFF';
    const blob = new Blob([bom + file.content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", file.filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  return (
    <div className="flex min-h-screen w-full flex-col items-center bg-background p-4">
       <Card className="w-full max-w-4xl">
        <CardHeader>
          <div className="flex items-center gap-4">
            <Link href="/" passHref>
              <Button variant="outline" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <CardTitle className="flex items-center gap-2">
                <HistoryIcon />
                Histórico de Extrações
              </CardTitle>
              <CardDescription>Consulte, visualize ou exclua extrações de dados anteriores.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : extractions.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-8 text-center">
              <AlertCircle className="h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">Nenhuma extração encontrada.</p>
              <p className="text-sm text-muted-foreground">Execute uma nova extração na tela principal.</p>
            </div>
          ) : (
            <Accordion type="single" collapsible className="w-full" value={openAccordionItem || undefined} onValueChange={setOpenAccordionItem}>
              {extractions.map(ext => {
                 const statusInfo = statusConfig[ext.status] || statusConfig.failed;
                 const Icon = statusInfo.icon;
                 return (
                 <AccordionItem value={`item-${ext.id}`} key={ext.id}>
                   <Card className='mb-2'>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4">
                        <div className='flex-grow'>
                            <p className="font-semibold">Extração de {ext.year}.{ext.semester}</p>
                            <p className="text-sm text-muted-foreground">Realizada em: {formatDate(ext.createdAt)}</p>
                        </div>
                        <div className="flex items-center gap-2 mt-4 sm:mt-0 flex-wrap justify-end">
                           <Badge className={cn("text-white", statusInfo.className)}>
                                <Icon className={cn("mr-2 h-4 w-4", ext.status === 'running' && 'animate-spin')} />
                                {statusInfo.text}
                            </Badge>
                           <AccordionTrigger asChild>
                              <Button variant="outline" disabled={ext.status === 'running'}>
                                <ChevronDown className="mr-2 h-4 w-4" />
                                Ver Arquivos
                              </Button>
                            </AccordionTrigger>
                            <LogPreviewDialog extractionId={ext.id} />
                             <Button 
                                variant="secondary"
                                onClick={() => handleReprocess(ext.id)} 
                                disabled={isReprocessing === ext.id || ext.status === 'running'}
                              >
                                {isReprocessing === ext.id ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="mr-2 h-4 w-4" />
                                )}
                                Reprocessar
                              </Button>
                            <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" disabled={ext.status === 'running'}>
                                <Trash2 className="mr-2 h-4 w-4" />
                                Excluir
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Esta ação não pode ser desfeita. Isso excluirá permanentemente os dados desta extração.
                                </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(ext.id)}>Continuar</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </div>
                     <AccordionContent>
                        <div className="p-4 pt-0">
                           {ext.files && ext.files.length > 0 ? (
                             <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                {ext.files.map(file => (
                                    <Card key={file.filename} className="p-4 flex flex-col items-center justify-center text-center">
                                        <FileText className="h-8 w-8 mb-2 text-primary"/>
                                        <p className="text-sm font-medium leading-tight mb-2 break-all">{file.filename}</p>
                                        <div className="flex gap-2 mt-2">
                                           <CSVPreviewDialog file={file} />
                                            <Button size="sm" variant="outline" onClick={() => downloadFile(file)}>
                                                <Download className="mr-2 h-4 w-4"/>
                                                Download
                                            </Button>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                           ) : (
                             <div className="text-center text-muted-foreground py-4">Nenhum arquivo processado para esta extração.</div>
                           )}
                        </div>
                     </AccordionContent>
                   </Card>
                 </AccordionItem>
                 )
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
