"use client";

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import type { Extraction, ScrapedDataRow } from '@/lib/types';
import { fetchExtractionDetails } from '@/lib/history-actions';
import { ArrowLeft, Eye, History as HistoryIcon, AlertCircle } from 'lucide-react';
import ResultsTable from '@/components/results-table';

interface DetailsPageProps {
    params: { id: string };
}

export default function HistoryDetailsPage({ params }: DetailsPageProps) {
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [data, setData] = useState<ScrapedDataRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const resolvedParams = use(params);
  const extractionId = parseInt(resolvedParams.id, 10);

  useEffect(() => {
    if (isNaN(extractionId)) {
        toast({ variant: 'destructive', title: 'Erro', description: 'ID da extração é inválido.' });
        setIsLoading(false);
        return;
    }

    async function loadDetails() {
      setIsLoading(true);
      const result = await fetchExtractionDetails(extractionId);
      if (result.success) {
        setExtraction(result.extraction || null);
        setData(result.data || []);
      } else {
        toast({ variant: 'destructive', title: 'Erro', description: result.error });
      }
      setIsLoading(false);
    }
    loadDetails();
  }, [extractionId, toast]);


  return (
    <div className="flex min-h-screen w-full flex-col items-center bg-background p-4">
       <Card className="w-full max-w-6xl">
        <CardHeader>
          <div className="flex items-center gap-4">
            <Link href="/history" passHref>
              <Button variant="outline" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Eye />
                Dados Brutos da Extração
              </CardTitle>
              {isLoading ? (
                <Skeleton className="h-4 w-48 mt-2" />
              ): (
                 <CardDescription>Resultados brutos da extração de {extraction?.year}.{extraction?.semester} realizada em {extraction ? new Date(extraction.createdAt).toLocaleDateString('pt-BR') : ''}.</CardDescription>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-64 w-full" />
            </div>
          ) : data.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-8 text-center">
              <AlertCircle className="h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">Nenhum dado encontrado para esta extração.</p>
            </div>
          ) : (
            <ResultsTable data={data} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
