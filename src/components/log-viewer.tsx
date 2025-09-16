"use client";

import { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Terminal } from 'lucide-react';

interface LogViewerProps {
  logs: string[];
  title?: string;
}

export default function LogViewer({ logs, title = "Logs" }: LogViewerProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom
    if (scrollAreaRef.current) {
        const viewport = scrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
        if (viewport) {
            viewport.scrollTop = viewport.scrollHeight;
        }
    }
  }, [logs]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-72 w-full rounded-md bg-muted p-4 font-mono text-sm" ref={scrollAreaRef}>
          {logs.length > 0 ? (
            logs.map((log, index) => (
              <div key={index} className="whitespace-pre-wrap">
                <span className="text-muted-foreground mr-2">{`[${new Date().toLocaleTimeString()}]`}</span>
                <span>{log}</span>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground">Aguardando início da extração para exibir os logs...</p>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
