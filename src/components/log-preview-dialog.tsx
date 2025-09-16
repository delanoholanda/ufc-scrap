"use client";

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Terminal, Loader2, AlertCircle } from 'lucide-react';
import { fetchExtractionLogs } from '@/lib/history-actions';
import type { ExtractionLog } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

interface LogPreviewDialogProps {
  extractionId: number;
}

export default function LogPreviewDialog({ extractionId }: LogPreviewDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<ExtractionLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadLogs() {
      if (!isOpen) return;

      setIsLoading(true);
      const result = await fetchExtractionLogs(extractionId);
      if (result.success && result.logs) {
        setLogs(result.logs);
      } else {
        toast({ variant: 'destructive', title: 'Erro', description: result.error });
      }
      setIsLoading(false);
    }
    loadLogs();
  }, [isOpen, extractionId, toast]);

  useEffect(() => {
    if (scrollAreaRef.current) {
        const viewport = scrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
        if (viewport) {
            viewport.scrollTop = viewport.scrollHeight;
        }
    }
  }, [logs]);
  
  const formatLogTimestamp = (dateString: string) => {
    try {
        // Extrai a hora do log original que já está no formato [HH:MM:SS]
        const timeMatch = dateString.match(/\[(\d{2}:\d{2}:\d{2})\]/);
        return timeMatch ? `[${timeMatch[1]}]` : '';
    } catch {
        return '';
    }
  }
  
   const cleanLogMessage = (logMessage: string) => {
      // Remove o timestamp e a tag [LOG] ou [ERRO] do início da mensagem
      return logMessage.replace(/\[\d{2}:\d{2}:\d{2}\]\[(LOG|ERRO)\]\s*/, '');
   }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <Terminal className="mr-2 h-4 w-4" />
          Ver Logs
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Logs da Extração #{extractionId}</DialogTitle>
          <DialogDescription>
            Visualização dos logs gerados durante o processo de extração.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          {isLoading ? (
             <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-4 text-muted-foreground">Carregando logs...</p>
             </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-96 text-muted-foreground">
                <AlertCircle className="h-8 w-8 mb-2" />
                <p>Nenhum log encontrado para esta extração.</p>
            </div>
          ) : (
             <ScrollArea className="h-[60vh] w-full rounded-md bg-muted p-4 font-mono text-sm" ref={scrollAreaRef}>
              {logs.map((log) => (
                  <div key={log.id} className="whitespace-pre-wrap">
                    <span className="text-muted-foreground mr-2">{formatLogTimestamp(log.log_message)}</span>
                    <span className={log.log_message.includes('[ERRO]') ? 'text-destructive' : ''}>
                        {cleanLogMessage(log.log_message)}
                    </span>
                  </div>
                ))}
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
