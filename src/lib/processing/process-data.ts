
import type { ScrapedDataRow, CSVFile } from '@/lib/types';
import Papa from 'papaparse';
import { processStudents } from './process-students';
import { processProfessors } from './process-professors';
import { processClasses } from './process-classes';

function toCSV(data: any[], columns: { key: string, label: string }[]): string {
  const fields = columns.map(c => c.label);
  const rows = data.map(item => {
    const row: any = {};
    columns.forEach(c => {
      row[c.label] = item[c.key];
    });
    return row;
  });

  return Papa.unparse({
    fields: fields,
    data: rows,
  }, {
    delimiter: ';',
    header: true,
  });
}

function uniteData(students: any[], professors: any[]): any[] {
    return [...students, ...professors];
}

export async function processData(
  scrapedData: ScrapedDataRow[],
  category: string,
  onLog?: (msg: string) => Promise<void>
): Promise<{ files: CSVFile[], postgresRows: any[] }> {
    const logger = onLog || (async (m: string) => console.log(m));
    
    await logger(`[PROCESS] Iniciando limpeza de ${scrapedData.length} registros...`);

    const processedInput = scrapedData.map(row => {
        const courseName = (row.curso || '').split(' -')[0].trim();
        const turmaClean = (row.turma || '').replace('Turma ', '').trim();
        const courseShortName = `${row.codigo} - ${row.componente} - ${turmaClean} - ${category}`;
        
        return {
            ...row,
            curso: courseName,
            'Curso ShortName': courseShortName,
            nome: (row.nome || '').split('\n')[0].replace('\r', '').trim(),
            matricula: String(row.matricula || '').trim()
        };
    });

    const {
        finalStudents,
        notFoundStudents,
        toSwapStudents,
        postgresStudents,
    } = await processStudents(processedInput, logger);

    const {
        finalProfessors,
        notFoundProfessors,
    } = await processProfessors(processedInput, logger);

    const classData = processClasses(processedInput, category);
    const allUsers = uniteData(finalStudents, finalProfessors);

    await logger(`[PROCESS] Gerando arquivos CSV finais...`);

    const files: CSVFile[] = [
        { 
            filename: `Turmas-${category}.csv`, 
            content: toCSV(classData, [{key: 'shortname', label: 'shortname'}, {key: 'fullname', label: 'fullname'}, {key: 'category_idnumber', label: 'category_idnumber'}]) 
        },
        { 
            filename: `Alunos-${category}.csv`, 
            content: toCSV(finalStudents, [{key: 'username', label: 'username'}, {key: 'firstname', label: 'firstname'}, {key: 'lastname', label: 'lastname'}, {key: 'email', label: 'email'}, {key: 'role1', label: 'role1'}, {key: 'course1', label: 'course1'}]) 
        },
        { 
            filename: `Alunos-NãoCadastrados-${category}.csv`, 
            content: toCSV(notFoundStudents, [{key: 'matricula', label: 'Matrícula'}, {key: 'nome', label: 'Nome'}, {key: 'curso', label: 'Curso'}, {key: 'tipoReserva', label: 'Tipo de Reserva'}, {key: 'cpf', label: 'CPF'}]) 
        },
        { 
            filename: `Alunos-Pre-Postgres-${category}.csv`, 
            content: toCSV(postgresStudents, [{key: 'matricula', label: 'Matrícula'}, {key: 'nome', label: 'Nome'}, {key: 'curso', label: 'Curso'}]) 
        },
        { 
            filename: `Alunos-TrocarMatricula-${category}.csv`, 
            content: toCSV(toSwapStudents, [{key: 'matricula', label: 'Matrícula'}, {key: 'nome', label: 'Nome'}, {key: 'curso', label: 'Curso'}, {key: 'tipoReserva', label: 'Tipo de Reserva'}, {key: 'cpf', label: 'CPF'}, {key: 'matriculaAntiga', label: 'MatriculaAntiga'}, {key: 'cursoAntigo', label: 'CursoAntigo'}]) 
        },
        { 
            filename: `Professores-${category}.csv`, 
            content: toCSV(finalProfessors, [{key: 'username', label: 'username'}, {key: 'firstname', label: 'firstname'}, {key: 'lastname', label: 'lastname'}, {key: 'email', label: 'email'}, {key: 'role1', label: 'role1'}, {key: 'course1', label: 'course1'}, {key: 'siape', label: 'siape'}]) 
        },
        { 
            filename: `Professores-NãoEncontrados-${category}.csv`, 
            content: toCSV(notFoundProfessors, [{key: 'nome', label: 'Nome'}, {key: 'cpf', label: 'CPF'}, {key: 'course1', label: 'Curso'}]) 
        },
        { 
            filename: `Usuarios-${category}.csv`, 
            content: toCSV(allUsers, [{key: 'username', label: 'username'}, {key: 'firstname', label: 'firstname'}, {key: 'lastname', label: 'lastname'}, {key: 'email', label: 'email'}, {key: 'role1', label: 'role1'}, {key: 'course1', label: 'course1'}]) 
        },
    ];

    return { files, postgresRows: postgresStudents };
}
