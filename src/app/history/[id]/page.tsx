"use client";

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import type { Extraction, ScrapedDataRow } from '@/lib/types';
import { fetchExtractionDetails } from '@/lib/history-actions';
import { ArrowLeft, Eye, History as HistoryIcon, AlertCircle, Loader2 } from 'lucide-react';
import ResultsTable from '@/components/results-table';
import MainLayout from '@/components/main-layout';
import { useParams } from 'next/navigation';

export default function HistoryDetailsPage() {
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [data, setData] = useState<ScrapedDataRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<number | null>(null);
  const { toast } = useToast();

  const params = useParams();
  const extractionId = parseInt(Array.isArray(params.id) ? params.id[0] : params.id, 10);

  useEffect(() => {
    const sessionUserId = sessionStorage.getItem("userId");
    if (sessionUserId) {
      setUserId(parseInt(sessionUserId, 10));
    } else {
        window.location.href = '/';
    }
  }, []);

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

  const handleLogout = () => {
    sessionStorage.removeItem("userId");
    window.location.href = '/';
  };

  if (!userId) {
     return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
     <MainLayout onLogout={handleLogout} userId={userId}>
        <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
             <header className="flex items-center justify-between">
                <div>
                     <CardTitle className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <Eye />
                        Dados Brutos da Extração
                    </CardTitle>
                    {isLoading ? (
                        <Skeleton className="h-4 w-48 mt-2" />
                    ): (
                        <CardDescription className="text-muted-foreground">Resultados brutos da extração de {extraction?.year}.{extraction?.semester} realizada em {extraction ? new Date(extraction.createdAt).toLocaleDateString('pt-BR') : ''}.</CardDescription>
                    )}
                </div>
            </header>
            <Card className="w-full mt-4">
                <CardContent className="pt-6">
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
     </MainLayout>
  );
}
