"use client";

import { useState, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getUploadedImages } from '@/lib/upload-actions';
import { Image as ImageIcon, Upload, Copy, Check, AlertCircle, Loader2 } from 'lucide-react';
import MainLayout from '@/components/main-layout';
import Image from 'next/image';

export default function UploadsPage() {
  const [images, setImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const { toast } = useToast();

  const fetchImages = useCallback(async () => {
    setIsLoading(true);
    const result = await getUploadedImages();
    if (result.success) {
      setImages(result.images || []);
    } else {
      toast({ variant: 'destructive', title: 'Erro', description: result.error });
    }
    setIsLoading(false);
  }, [toast]);

  useEffect(() => {
    const sessionUserId = sessionStorage.getItem("userId");
    if (sessionUserId) {
      setCurrentUserId(parseInt(sessionUserId, 10));
    } else {
      window.location.href = '/';
    }
  }, []);

  useEffect(() => {
    if(currentUserId) {
        fetchImages();
    }
  }, [currentUserId, fetchImages]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    
    setIsUploading(true);
    const file = acceptedFiles[0];
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Falha no upload do servidor.');
      }
      
      toast({ title: 'Sucesso', description: `Imagem ${result.filename} enviada com sucesso.` });
      setImages(prev => [result.filename, ...prev]);

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ocorreu um erro desconhecido.';
      toast({ variant: 'destructive', title: 'Erro de Upload', description: message });
    } finally {
      setIsUploading(false);
    }
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.png', '.jpg', '.webp', '.gif'] },
    multiple: false,
  });

  const handleCopyPath = (imageName: string) => {
    const path = `/uploads/${imageName}`;
    navigator.clipboard.writeText(path);
    setCopiedPath(imageName);
    toast({ title: 'Copiado!', description: `O caminho ${path} foi copiado para a área de transferência.` });
    setTimeout(() => setCopiedPath(null), 2000);
  };

  const handleLogout = () => {
    sessionStorage.removeItem("userId");
    window.location.href = '/';
  };

  if (!currentUserId) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <MainLayout onLogout={handleLogout} userId={currentUserId}>
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ImageIcon />
            Gerenciamento de Imagens
          </h1>
          <p className="text-muted-foreground">Faça upload de novas imagens e visualize as existentes.</p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Upload de Nova Imagem</CardTitle>
            <CardDescription>Arraste uma imagem aqui ou clique para selecionar. A imagem será convertida para WebP.</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              {...getRootProps()}
              className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-md cursor-pointer transition-colors ${isDragActive ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}
            >
              <input {...getInputProps()} disabled={isUploading} />
              {isUploading ? (
                <>
                  <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                  <p className="text-muted-foreground">Enviando e processando...</p>
                </>
              ) : (
                <>
                  <Upload className="h-10 w-10 text-muted-foreground mb-4" />
                  {isDragActive ? (
                    <p className="font-semibold">Solte a imagem aqui!</p>
                  ) : (
                    <p className="text-muted-foreground">Arraste e solte uma imagem ou clique para selecionar</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">Arquivos permitidos: JPG, PNG, GIF, WebP</p>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Imagens Salvas</CardTitle>
            <CardDescription>Imagens disponíveis em <code>public/uploads/</code></CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="aspect-square bg-muted rounded-md animate-pulse" />
                ))}
              </div>
            ) : images.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-8 text-center">
                <AlertCircle className="h-12 w-12 text-muted-foreground" />
                <p className="text-xl font-medium">Nenhuma imagem encontrada.</p>
                <p className="text-muted-foreground">Faça o upload de uma imagem para vê-la aqui.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {images.map(image => (
                  <Card key={image} className="overflow-hidden group">
                    <div className="aspect-square relative">
                      <Image
                        src={`/uploads/${image}`}
                        alt={image}
                        fill
                        sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
                        className="object-cover"
                      />
                    </div>
                    <div className="p-2 bg-background/80">
                      <p className="text-xs font-medium truncate" title={image}>{image}</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full mt-2"
                        onClick={() => handleCopyPath(image)}
                      >
                        {copiedPath === image ? (
                           <Check className="mr-2 h-4 w-4 text-green-500" />
                        ) : (
                           <Copy className="mr-2 h-4 w-4" />
                        )}
                        Copiar Caminho
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
