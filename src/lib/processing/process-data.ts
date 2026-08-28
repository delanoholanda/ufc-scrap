
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
  previousData?: ScrapedDataRow[] | null,
  previousFiles?: CSVFile[] | null
): Promise<{ files: CSVFile[], postgresRows: any[], noChanges?: boolean }> {
    const logger = onLog || (async (m: string) => console.log(m));
    
    await logger(`[PROCESS] Iniciando limpeza de ${scrapedData.length} registros...`);

    const isIncremental = Boolean((previousFiles && previousFiles.length > 0) || (previousData && previousData.length > 0));

    const prevStudentMap = new Map<string, any>();
    const prevProfessorMap = new Map<string, any>();
    const prevClasses = new Set<string>();

    if (isIncremental) {
        if (previousFiles && previousFiles.length > 0) {
            const prevStudentsFile = previousFiles.find(f => f.filename === `Alunos-${category}.csv`);
            if (prevStudentsFile) {
                const parsed = Papa.parse<any>(prevStudentsFile.content, { header: true, delimiter: ';', skipEmptyLines: true });
                parsed.data.forEach(r => {
                    const u = (r.username || '').trim();
                    const c = (r.course1 || '').trim();
                    if (u && c) {
                        prevStudentMap.set(`${u}|${c}`, { ...r, username: u, course1: c });
                    }
                });
            }

            const prevProfessorsFile = previousFiles.find(f => f.filename === `Professores-${category}.csv`);
            if (prevProfessorsFile) {
                const parsed = Papa.parse<any>(prevProfessorsFile.content, { header: true, delimiter: ';', skipEmptyLines: true });
                parsed.data.forEach(r => {
                    const u = (r.username || '').trim();
                    const c = (r.course1 || '').trim();
                    if (u && c) {
                        prevProfessorMap.set(`${u}|${c}`, { ...r, username: u, course1: c });
                    }
                });
            }

            const prevTurmasFile = previousFiles.find(f => f.filename === `Turmas-${category}.csv`);
            if (prevTurmasFile) {
                const parsed = Papa.parse<{ shortname?: string }>(prevTurmasFile.content, { header: true, delimiter: ';', skipEmptyLines: true });
                parsed.data.forEach(r => {
                    const s = (r.shortname || '').trim();
                    if (s) prevClasses.add(s);
                });
            }
        }

        // Fallback: se não houver CSVs salvos na consulta anterior, mas houver previousData
        if (prevClasses.size === 0 && previousData && previousData.length > 0) {
            previousData.forEach(r => {
                const courseName = (r.curso || '').split(' -')[0].trim();
                const componenteClean = (r.componente || '').replace(/\s*\(.*\)\s*$/, '').trim();
                const turmaClean = (r.turma || '').replace('Turma ', '').trim();
                const courseShortName = `${r.codigo} - ${componenteClean} - ${turmaClean} - ${category}`;
                prevClasses.add(courseShortName);
            });
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

    let incStudents: any[] = [];
    let incProfessors: any[] = [];
    let incClassData: any[] = [];
    let incAllUsers: any[] = [];

    let remStudents: any[] = [];
    let remProfessors: any[] = [];
    let remAllUsers: any[] = [];

    if (isIncremental) {
        const currentStudentKeys = new Set<string>();
        finalStudents.forEach(s => {
            const key = `${(s.username || '').trim()}|${(s.course1 || '').trim()}`;
            currentStudentKeys.add(key);
            if (!prevStudentMap.has(key)) {
                incStudents.push(s);
            }
        });

        const currentProfessorKeys = new Set<string>();
        finalProfessors.forEach(p => {
            const key = `${(p.username || '').trim()}|${(p.course1 || '').trim()}`;
            currentProfessorKeys.add(key);
            if (!prevProfessorMap.has(key)) {
                incProfessors.push(p);
            }
        });

        incClassData = classData.filter(c => {
            const key = (c.shortname || '').trim();
            return !prevClasses.has(key);
        });

        incAllUsers = uniteData(incStudents, incProfessors);

        // Desmatrículas / Remoções (role1 = 'none')
        prevStudentMap.forEach((studentObj, key) => {
            if (!currentStudentKeys.has(key)) {
                remStudents.push({ ...studentObj, role1: 'none' });
            }
        });

        prevProfessorMap.forEach((profObj, key) => {
            if (!currentProfessorKeys.has(key)) {
                remProfessors.push({ ...profObj, role1: 'none' });
            }
        });

        remAllUsers = uniteData(remStudents, remProfessors);

        await logger(`[INCREMENTAL] Comparativo com busca anterior: ${incStudents.length} novos alunos (+${remStudents.length} removidos), ${incProfessors.length} novos professores (+${remProfessors.length} removidos), ${incClassData.length} novas turmas.`);

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
                filename: `Alunos-Removidos-${category}.csv`,
                content: toCSV(remStudents, [{key: 'username', label: 'username'}, {key: 'firstname', label: 'firstname'}, {key: 'lastname', label: 'lastname'}, {key: 'email', label: 'email'}, {key: 'role1', label: 'role1'}, {key: 'course1', label: 'course1'}])
            },
            {
                filename: `Professores-Novos-${category}.csv`,
                content: toCSV(incProfessors, [{key: 'username', label: 'username'}, {key: 'firstname', label: 'firstname'}, {key: 'lastname', label: 'lastname'}, {key: 'email', label: 'email'}, {key: 'role1', label: 'role1'}, {key: 'course1', label: 'course1'}])
            },
            {
                filename: `Professores-Removidos-${category}.csv`,
                content: toCSV(remProfessors, [{key: 'username', label: 'username'}, {key: 'firstname', label: 'firstname'}, {key: 'lastname', label: 'lastname'}, {key: 'email', label: 'email'}, {key: 'role1', label: 'role1'}, {key: 'course1', label: 'course1'}])
            },
            {
                filename: `Usuarios-Novos-${category}.csv`,
                content: toCSV(incAllUsers, [{key: 'username', label: 'username'}, {key: 'firstname', label: 'firstname'}, {key: 'lastname', label: 'lastname'}, {key: 'email', label: 'email'}, {key: 'role1', label: 'role1'}, {key: 'course1', label: 'course1'}])
            },
            {
                filename: `Usuarios-Removidos-${category}.csv`,
                content: toCSV(remAllUsers, [{key: 'username', label: 'username'}, {key: 'firstname', label: 'firstname'}, {key: 'lastname', label: 'lastname'}, {key: 'email', label: 'email'}, {key: 'role1', label: 'role1'}, {key: 'course1', label: 'course1'}])
            }
        );
    }

    const noChanges = isIncremental && incStudents.length === 0 && incProfessors.length === 0 && incClassData.length === 0 && remStudents.length === 0 && remProfessors.length === 0;


    return { 
        files, 
        postgresRows: postgresStudents, 
        noChanges
    };
}

