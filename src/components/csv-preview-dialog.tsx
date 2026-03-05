"use client";

import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Eye, Loader2, AlertCircle } from 'lucide-react';
import type { CSVFile } from '@/lib/types';

interface CSVPreviewDialogProps {
  file: CSVFile;
}

export default function CSVPreviewDialog({ file }: CSVPreviewDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      setError(null);
      Papa.parse<Record<string, string>>(file.content, {
        header: true,
        skipEmptyLines: true,
        delimiter: ';',
        complete: (results) => {
          if (results.errors.length > 0) {
            console.error("CSV Parsing errors: ", results.errors);
            setError(`Falha ao analisar o CSV. Erro: ${results.errors[0].message}`);
          } else {
            setHeaders(results.meta.fields || []);
            setData(results.data);
          }
          setIsLoading(false);
        },
        error: (err: Error) => {
           setError(`Erro ao analisar o arquivo: ${err.message}`);
           setIsLoading(false);
        }
      });
    }
  }, [isOpen, file.content]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <Eye className="mr-2 h-4 w-4" />
          Visualizar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[95vw] lg:max-w-6xl overflow-hidden flex flex-col h-[90vh]">
        <DialogHeader>
          <DialogTitle>Visualizando: {file.filename}</DialogTitle>
          <DialogDescription>
            Pré-visualização do conteúdo do arquivo CSV.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 relative overflow-hidden mt-4 rounded-md border bg-card">
          {isLoading ? (
             <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-4 text-muted-foreground">Analisando e carregando dados...</p>
             </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-destructive p-8 text-center">
                <AlertCircle className="h-8 w-8 mb-2" />
                <p>{error}</p>
            </div>
          ) : (
            <ScrollArea className="h-full w-full">
              <div className="w-max min-w-full">
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-20 shadow-sm">
                    <TableRow className="hover:bg-transparent">
                      {headers.map(header => (
                        <TableHead key={header} className="whitespace-nowrap px-4 py-3 font-bold text-foreground border-b text-center">
                          {header}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.map((row, rowIndex) => (
                      <TableRow key={rowIndex} className="hover:bg-muted/50">
                        {headers.map(header => (
                          <TableCell key={`${rowIndex}-${header}`} className="px-4 py-2 border-b border-r last:border-r-0 max-w-md truncate text-xs">
                            {row[header]}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <ScrollBar orientation="horizontal" />
              <ScrollBar orientation="vertical" />
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
