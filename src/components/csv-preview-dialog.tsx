"use client";

import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
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
        error: (err) => {
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
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Visualizando: {file.filename}</DialogTitle>
          <DialogDescription>
            Pré-visualização do conteúdo do arquivo CSV.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          {isLoading ? (
             <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-4 text-muted-foreground">Analisando e carregando dados...</p>
             </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-96 text-destructive">
                <AlertCircle className="h-8 w-8 mb-2" />
                <p>{error}</p>
            </div>
          ) : (
            <ScrollArea className="h-[60vh] w-full rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    {headers.map(header => (
                      <TableHead key={header}>{header}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((row, rowIndex) => (
                    <TableRow key={rowIndex}>
                      {headers.map(header => (
                        <TableCell key={`${rowIndex}-${header}`}>{row[header]}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
