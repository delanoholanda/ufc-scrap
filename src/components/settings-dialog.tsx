"use client";

import { useState, useEffect, type ReactNode } from 'react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Save, User, CheckCircle, AlertCircle, Loader2, Wifi, Mail } from "lucide-react";
import { useCredentials } from "@/hooks/use-credentials";
import { useToast } from "@/hooks/use-toast";
import { testConnections } from '@/lib/system-actions';

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error';

interface SettingsDialogProps {
    children?: ReactNode;
}

export default function SettingsDialog({ children }: SettingsDialogProps) {
  const { username, password, saveCredentials, isLoaded } = useCredentials();
  const [localUser, setLocalUser] = useState('');
  const [localPass, setLocalPass] = useState('');
  const { toast } = useToast();

  const [pgStatus, setPgStatus] = useState<ConnectionStatus>('idle');
  const [ldapStatus, setLdapStatus] = useState<ConnectionStatus>('idle');
  const [emailStatus, setEmailStatus] = useState<ConnectionStatus>('idle');
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    if (isLoaded) {
      setLocalUser(username);
      setLocalPass(password);
    }
  }, [isLoaded, username, password]);

  const handleSave = () => {
    saveCredentials(localUser, localPass);
    toast({
        title: "Credenciais Salvas",
        description: "Suas credenciais do SIGAA foram salvas localmente. A página será recarregada.",
    });
    setTimeout(() => {
        window.location.reload();
    }, 1500);
  };
  
  const handleTestConnections = async () => {
      setIsTesting(true);
      setPgStatus('testing');
      setLdapStatus('testing');
      setEmailStatus('testing');

      const results = await testConnections();

      setPgStatus(results.postgres.success ? 'success' : 'error');
      setLdapStatus(results.ldap.success ? 'success' : 'error');
      setEmailStatus(results.email.success ? 'success' : 'error');
      
      toast({
          title: "Teste de Conexão Concluído",
          description: "Verifique os resultados na janela de configurações.",
      });

      setIsTesting(false);
  };

  const StatusIndicator = ({ status }: { status: ConnectionStatus }) => {
    switch (status) {
      case 'testing':
        return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return null;
    }
  };


  return (
    <Dialog>
      <DialogTrigger asChild>
        {children ? (
            children
        ) : (
            <Button variant="outline" size="icon" aria-label="Configurações">
                <Settings className="h-4 w-4" />
            </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Configurações Gerais</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
            {/* SIGAA Credentials */}
            <div>
              <h3 className="text-lg font-medium mb-2">Credenciais do SIGAA</h3>
              <DialogDescription className="mb-4">
                Seu usuário e senha para a automação. As informações
                são salvas apenas no seu navegador.
              </DialogDescription>
              <div className="space-y-4">
                 <div className="flex items-center gap-2 rounded-md bg-muted p-3">
                    <User className="h-5 w-5 text-muted-foreground" />
                    <div className='text-sm'>
                      <span className='font-medium text-muted-foreground'>Usuário configurado: </span>
                      <span className='font-bold'>{isLoaded ? (username || 'Nenhum') : 'Carregando...'}</span>
                    </div>
                  </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="sigaa-user" className="text-right">
                    Usuário
                  </Label>
                  <Input
                    id="sigaa-user"
                    value={localUser}
                    onChange={(e) => setLocalUser(e.target.value)}
                    className="col-span-3"
                    placeholder="Usuário do SIGAA"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="sigaa-pass" className="text-right">
                    Senha
                  </Label>
                  <Input
                    id="sigaa-pass"
                    type="password"
                    value={localPass}
                    onChange={(e) => setLocalPass(e.target.value)}
                    className="col-span-3"
                    placeholder="••••••••"
                  />
                </div>
                 <div className='flex justify-end'>
                    <Button onClick={handleSave} size="sm">
                        <Save className="mr-2 h-4 w-4" />
                        Salvar Credenciais
                    </Button>
                </div>
              </div>
            </div>

            {/* Connection Tests */}
            <div className='border-t pt-4'>
               <h3 className="text-lg font-medium mb-2">Conexões Externas</h3>
                <DialogDescription className="mb-4">
                    Verifique se o sistema consegue se conectar com os serviços externos usando as credenciais do arquivo .env.
                </DialogDescription>
                <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-md border p-3">
                        <div className="flex items-center gap-2">
                           <Wifi className="h-5 w-5 text-muted-foreground" />
                           <span className="font-medium">PostgreSQL</span>
                        </div>
                        <StatusIndicator status={pgStatus} />
                    </div>
                     <div className="flex items-center justify-between rounded-md border p-3">
                        <div className="flex items-center gap-2">
                           <Wifi className="h-5 w-5 text-muted-foreground" />
                           <span className="font-medium">LDAP</span>
                        </div>
                        <StatusIndicator status={ldapStatus} />
                    </div>
                    <div className="flex items-center justify-between rounded-md border p-3">
                        <div className="flex items-center gap-2">
                           <Mail className="h-5 w-5 text-muted-foreground" />
                           <span className="font-medium">SMTP (E-mail)</span>
                        </div>
                        <StatusIndicator status={emailStatus} />
                    </div>
                </div>
            </div>
        </div>

        <DialogFooter>
            <Button onClick={handleTestConnections} disabled={isTesting} variant="outline">
                {isTesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wifi className="mr-2 h-4 w-4" />}
                Testar Conexões
            </Button>
             <DialogClose asChild>
                <Button type="button">Fechar</Button>
            </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
