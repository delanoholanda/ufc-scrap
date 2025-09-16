"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Play, AlertCircle, Eye, XCircle } from "lucide-react";
import { cancelExtraction } from "@/lib/cancel-action";
import type { ScrapedDataRow } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import LogViewer from "./log-viewer";
import { Switch } from "./ui/switch";
import { useRouter } from 'next/navigation';

export default function ScraperView() {
  const [loading, setLoading] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [visibleMode, setVisibleMode] = useState(false);
  const { toast } = useToast();
  const [sigaaUsername, setSigaaUsername] = useState('');
  const [sigaaPassword, setSigaaPassword] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [year, setYear] = useState<string>(new Date().getFullYear().toString());
  const [semester, setSemester] = useState<string>("1");
  const [currentExtractionId, setCurrentExtractionId] = useState<number | null>(null);
  const router = useRouter();


  useEffect(() => {
    const storedUser = localStorage.getItem('sigaa_username') || '';
    const storedPass = localStorage.getItem('sigaa_password') || '';
    setSigaaUsername(storedUser);
    setSigaaPassword(storedPass);
    setIsLoaded(true);
  }, []);

  const handleCancel = async () => {
    if (currentExtractionId === null) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Não há extração em andamento para cancelar.'});
      return;
    }
    setIsCancelling(true);
    setLogs(prev => [...prev, '[AVISO] Solicitação de cancelamento enviada. Aguardando o término do ciclo atual...']);
    const result = await cancelExtraction(currentExtractionId);
    if (!result.success) {
      toast({ variant: 'destructive', title: 'Erro ao Cancelar', description: result.error });
      setIsCancelling(false); // Allow user to try again
    } else {
       toast({ title: 'Cancelamento Solicitado', description: 'O processo será interrompido em breve.'});
    }
  };

  const handleScrapeSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setLoading(true);
    setIsCancelling(false);
    setError(null);
    setLogs([]);
    setCurrentExtractionId(null);

    const formData = new FormData(event.currentTarget);
    formData.append("username", sigaaUsername);
    formData.append("password", sigaaPassword);
    if (visibleMode) {
      formData.append("visibleMode", "on");
    }

    try {
      if (!isLoaded) {
        throw new Error("Aguarde o carregamento das credenciais.");
      }
      if (!sigaaUsername || !sigaaPassword) {
        throw new Error("Credenciais do SIGAA não configuradas. Por favor, configure suas credenciais no menu de configurações para prosseguir com a ação.");
      }

      // Use a ReadableStream to get logs in real-time
      const response = await fetch('/api/scrape', {
        method: 'POST',
        body: formData,
      });

      if (!response.body) {
        throw new Error("A resposta do servidor não contém um corpo para streaming.");
      }
      
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        try {
          // Handle multiple JSON objects in a single chunk
          const jsonObjects = value.trim().split('\n').filter(s => s.trim() !== '');
          for (const jsonString of jsonObjects) {
             const chunk = JSON.parse(jsonString);
              if(chunk.log) {
                setLogs(prev => [...prev, chunk.log]);
              }
              if(chunk.error) {
                setError(chunk.error);
                toast({
                  variant: "destructive",
                  title: "Falha na Extração",
                  description: chunk.error,
                });
              }
              if(chunk.extractionId) {
                setCurrentExtractionId(chunk.extractionId);
              }
              if (chunk.finalResult) {
                if (chunk.finalResult.success) {
                  toast({
                    title: "Extração e Processamento Concluídos!",
                    description: `Foram encontrados e processados ${chunk.finalResult.data.length} registros. Redirecionando para o histórico...`,
                  });
                  router.push('/history');
                } else if (chunk.finalResult.cancelled) {
                  toast({
                      variant: "default",
                      title: "Operação Cancelada",
                      description: "A extração foi interrompida pelo usuário.",
                  });
                  setError("A extração foi cancelada pelo usuário.");
                } else {
                  setError(chunk.finalResult.error || 'Unknown scraping error');
                }
              }
          }
        } catch (e) {
            // This might happen if a non-JSON chunk is received or if there's a parsing error.
            console.warn("Could not parse stream chunk:", value, "Error:", e);
        }
      }


    } catch (e: any) {
        let errorMessage = e.message || 'An unknown error occurred.';
        setError(errorMessage);
        setLogs(prev => [...prev, `[ERRO FATAL] ${errorMessage}`]);
        toast({
            variant: "destructive",
            title: "Erro Inesperado",
            description: errorMessage,
        });
    } finally {
      setLoading(false);
      setIsCancelling(false);
      setCurrentExtractionId(null);
    }
  };


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Extração e Processamento de Dados do SIGAA</CardTitle>
          <CardDescription>
            Preencha os campos abaixo para buscar, processar e salvar os dados do portal. O processo pode levar alguns minutos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleScrapeSubmit} className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="year">Ano</Label>
              <Input id="year" name="year" type="number" placeholder="Ex: 2025" defaultValue={year} required disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="semester">Período</Label>
              <Input id="semester" name="semester" type="number" placeholder="1 ou 2" defaultValue={semester} required min="1" max="2" disabled={loading}/>
            </div>
             <div className="flex items-center space-x-2 pt-2">
                <Switch id="visible-mode" checked={visibleMode} onCheckedChange={setVisibleMode} disabled={loading} />
                <Label htmlFor="visible-mode" className="flex items-center gap-1.5 cursor-pointer">
                  <Eye className="h-4 w-4" />
                  Modo Visível
                </Label>
            </div>
            <div className="flex items-center justify-between sm:justify-self-end w-full sm:w-auto gap-4 col-span-full lg:col-span-1">
               <div className="flex items-center space-x-2 pt-2">
                <Switch id="show-logs" checked={showLogs} onCheckedChange={setShowLogs} disabled={loading} />
                <Label htmlFor="show-logs">Ver Logs</Label>
              </div>
              {!loading ? (
                 <Button type="submit" className="w-full sm:w-auto" disabled={!isLoaded}>
                    <Play className="mr-2 h-4 w-4" />
                    {isLoaded ? "Iniciar" : "Carregando..."}
                 </Button>
              ) : (
                 <Button type="button" variant="destructive" className="w-full sm:w-auto" onClick={handleCancel} disabled={isCancelling}>
                    {isCancelling ? (
                       <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <XCircle className="mr-2 h-4 w-4" />
                    )}
                    {isCancelling ? "Cancelando..." : "Cancelar"}
                 </Button>
              )}

            </div>
          </form>
        </CardContent>
      </Card>
      
      {(loading && !showLogs) && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-8 text-center animate-pulse">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-muted-foreground">Aguarde, o robô está trabalhando...</p>
            <p className="text-sm text-muted-foreground">Isso pode levar alguns minutos. Não feche esta aba.</p>
        </div>
      )}

      {error && (
        <Alert variant={error.includes("cancelada") ? "default" : "destructive"}>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{error.includes("cancelada") ? "Operação Cancelada" : "Ocorreu um Erro"}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {(showLogs || loading) && <LogViewer logs={logs} title="Logs da Extração" />}

    </div>
  );
}
