"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Play, AlertCircle, Eye, Ban } from "lucide-react";
import { scrapeUFCData } from "@/lib/actions";
import { useToast } from "@/hooks/use-toast";
import LogViewer from "./log-viewer";
import { Switch } from "./ui/switch";
import { useRouter } from 'next/navigation';

export default function ScraperView() {
  const [loading, setLoading] = useState(false);
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
  const router = useRouter();

  useEffect(() => {
    const storedUser = localStorage.getItem('sigaa_username') || '';
    const storedPass = localStorage.getItem('sigaa_password') || '';
    setSigaaUsername(storedUser);
    setSigaaPassword(storedPass);
    setIsLoaded(true);
  }, []);

  const handleScrapeSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setLoading(true);
    setError(null);
    setLogs([]);

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
      
      const result = await scrapeUFCData(formData);
      
      if (result.logs) {
        setLogs(result.logs);
      }
      
      if (result.cancelled) {
          setError('A extração foi cancelada.');
          toast({
            variant: "destructive",
            title: "Extração Cancelada",
            description: "O processo foi interrompido pelo usuário.",
          });
      } else if (result.success && result.data) {
        toast({
          title: "Extração e Processamento Concluídos!",
          description: `Foram encontrados e processados ${result.data.length} registros. Redirecionando para o histórico...`,
        });
        // Redirect to history page on success
        router.push('/history');

      } else {
        const errorMessage = result.error || 'Unknown scraping error';
        setError(errorMessage);
        toast({
          variant: "destructive",
          title: "Falha na Extração",
          description: errorMessage,
        });
      }
    } catch (e: any) {
       if (e.name === 'AbortError') {
            setError('A extração foi cancelada pelo usuário.');
            setLogs(prev => [...prev, "[ERRO] A operação foi abortada pelo cliente."]);
       } else {
            const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
            setError(errorMessage);
            setLogs(prev => [...prev, `[ERRO FATAL] ${errorMessage}`]);
            toast({
                variant: "destructive",
                title: "Erro Inesperado",
                description: errorMessage,
            });
       }
    } finally {
      setLoading(false);
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
              <Button type="submit" className="w-full sm:w-auto" disabled={loading || !isLoaded}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                {loading ? 'Extraindo...' : (isLoaded ? 'Iniciar' : 'Carregando...')}
              </Button>
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
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Ocorreu um Erro ou Ação</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {(showLogs || loading) && <LogViewer logs={logs} title="Logs da Extração" />}

    </div>
  );
}
