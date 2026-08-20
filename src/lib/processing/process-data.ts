
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
  onLog?: (msg: string) => Promise<void>,
  previousData?: ScrapedDataRow[] | null
): Promise<{ files: CSVFile[], postgresRows: any[], noChanges?: boolean }> {
    const logger = onLog || (async (m: string) => console.log(m));
    
    await logger(`[PROCESS] Iniciando limpeza de ${scrapedData.length} registros...`);

    let isIncremental = false;
    let newOrChangedRows: ScrapedDataRow[] = scrapedData;

    if (previousData && previousData.length > 0) {
        isIncremental = true;
        const prevSet = new Set(
            previousData.map(r => `${(r.codigo || '').trim()}|${(r.componente || '').trim()}|${(r.turma || '').trim()}|${(r.matricula || '').trim()}|${(r.docente || '').trim()}`)
        );
        newOrChangedRows = scrapedData.filter(
            r => !prevSet.has(`${(r.codigo || '').trim()}|${(r.componente || '').trim()}|${(r.turma || '').trim()}|${(r.matricula || '').trim()}|${(r.docente || '').trim()}`)
        );

        if (newOrChangedRows.length === 0) {
            await logger(`[INCREMENTAL] Nenhuma alteração encontrada em relação à extração anterior do período ${category}.`);
        } else {
            await logger(`[INCREMENTAL] Encontrados ${newOrChangedRows.length} novos registros em relação à busca anterior do período ${category}.`);
        }
    }

    const processedInput = scrapedData.map(row => {
        const courseName = (row.curso || '').split(' -')[0].trim();
        
        // Limpa o nome do componente removendo sufixos como (GRADUAÇÃO), (PÓS-GRADUAÇÃO) etc.
        const componenteClean = (row.componente || '').replace(/\s*\(.*\)\s*$/, '').trim();
        
        const turmaClean = (row.turma || '').replace('Turma ', '').trim();
        const courseShortName = `${row.codigo} - ${componenteClean} - ${turmaClean} - ${category}`;
        
        return {
            ...row,
            curso: courseName,
            componente: componenteClean,
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
            content: toCSV(finalProfessors, [{key: 'username', label: 'username'}, {key: 'firstname', label: 'firstname'}, {key: 'lastname', label: 'lastname'}, {key: 'email', label: 'email'}, {key: 'role1', label: 'role1'}, {key: 'course1', label: 'course1'}]) 
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

    if (isIncremental && newOrChangedRows.length > 0) {
        const incrementalProcessedInput = newOrChangedRows.map(row => {
            const courseName = (row.curso || '').split(' -')[0].trim();
            const componenteClean = (row.componente || '').replace(/\s*\(.*\)\s*$/, '').trim();
            const turmaClean = (row.turma || '').replace('Turma ', '').trim();
            const courseShortName = `${row.codigo} - ${componenteClean} - ${turmaClean} - ${category}`;
            
            return {
                ...row,
                curso: courseName,
                componente: componenteClean,
                'Curso ShortName': courseShortName,
                nome: (row.nome || '').split('\n')[0].replace('\r', '').trim(),
                matricula: String(row.matricula || '').trim()
            };
        });

        const { finalStudents: incStudents } = await processStudents(incrementalProcessedInput, async () => {});
        const { finalProfessors: incProfessors } = await processProfessors(incrementalProcessedInput, async () => {});
        const incClassData = processClasses(incrementalProcessedInput, category);
        const incAllUsers = uniteData(incStudents, incProfessors);

        files.push(
            {
                filename: `Turmas-Novas-${category}.csv`,
                content: toCSV(incClassData, [{key: 'shortname', label: 'shortname'}, {key: 'fullname', label: 'fullname'}, {key: 'category_idnumber', label: 'category_idnumber'}])
            },
            {
                filename: `Alunos-Novos-${category}.csv`,
                content: toCSV(incStudents, [{key: 'username', label: 'username'}, {key: 'firstname', label: 'firstname'}, {key: 'lastname', label: 'lastname'}, {key: 'email', label: 'email'}, {key: 'role1', label: 'role1'}, {key: 'course1', label: 'course1'}])
            },
            {
                filename: `Professores-Novos-${category}.csv`,
                content: toCSV(incProfessors, [{key: 'username', label: 'username'}, {key: 'firstname', label: 'firstname'}, {key: 'lastname', label: 'lastname'}, {key: 'email', label: 'email'}, {key: 'role1', label: 'role1'}, {key: 'course1', label: 'course1'}])
            },
            {
                filename: `Usuarios-Novos-${category}.csv`,
                content: toCSV(incAllUsers, [{key: 'username', label: 'username'}, {key: 'firstname', label: 'firstname'}, {key: 'lastname', label: 'lastname'}, {key: 'email', label: 'email'}, {key: 'role1', label: 'role1'}, {key: 'course1', label: 'course1'}])
            }
        );
    }

    return { 
        files, 
        postgresRows: postgresStudents, 
        noChanges: isIncremental && newOrChangedRows.length === 0 
    };
}
