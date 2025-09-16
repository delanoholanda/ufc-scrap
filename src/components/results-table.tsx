"use client";

import type { ScrapedDataRow } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "./ui/button";
import { Download } from "lucide-react";
import { ScrollArea } from "./ui/scroll-area";

interface ResultsTableProps {
  data: ScrapedDataRow[];
}

export default function ResultsTable({ data }: ResultsTableProps) {
  
  const downloadCSV = () => {
    const header = [
      "Código",
      "Componente",
      "Docente(s)",
      "Turma",
      "Matrícula",
      "Nome",
      "Curso",
      "Tipo de Reserva",
      "Situação",
    ];

    const rows = data.map(row =>
      [
        `"${row.codigo}"`,
        `"${row.componente}"`,
        `"${row.docente}"`,
        `"${row.turma}"`,
        `"${row.matricula}"`,
        `"${row.nome}"`,
        `"${row.curso}"`,
        `"${row.tipoReserva}"`,
        `"${row.situacao}"`,
      ].join(';')
    );
    
    // BOM for UTF-8
    const bom = '\uFEFF';
    const csvContent = bom + [header.join(';'), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "consulta_turmas_matriculas.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Resultados da Extração</CardTitle>
          <CardDescription>
            Confira os dados extraídos abaixo ou faça o download do arquivo CSV.
          </CardDescription>
        </div>
        <Button onClick={downloadCSV}>
          <Download className="mr-2 h-4 w-4" />
          Download CSV
        </Button>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] w-full rounded-md border">
          <Table>
            <TableCaption>Fim dos resultados.</TableCaption>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Componente</TableHead>
                <TableHead>Docente(s)</TableHead>
                <TableHead>Turma</TableHead>
                <TableHead>Matrícula</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Curso</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{row.codigo}</TableCell>
                  <TableCell>{row.componente}</TableCell>
                  <TableCell>{row.docente}</TableCell>
                  <TableCell>{row.turma}</TableCell>
                  <TableCell>{row.matricula}</TableCell>
                  <TableCell>{row.nome}</TableCell>
                  <TableCell>{row.curso}</TableCell>
                  <TableCell>{row.situacao}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
