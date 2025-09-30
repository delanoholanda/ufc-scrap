import type { ScrapedDataRow, CSVFile } from '@/lib/types';
import Papa from 'papaparse';
import { processStudents } from './process-students';
import { processProfessors } from './process-professors';
import { processClasses } from './process-classes';

function toCSV(data: any[], columns: string[]): string {
  return Papa.unparse({
    fields: columns,
    data: data,
  }, {
    delimiter: ';',
    header: true,
  });
}

function uniteData(students: any[], professors: any[]): any[] {
    const studentData = students.map(s => ({...s}));
    const professorData = professors.map(p => ({...p}));
    return [...studentData, ...professorData];
}

export async function processData(
  scrapedData: ScrapedDataRow[],
  category: string
): Promise<CSVFile[]> {
    // 1. Data Cleaning and Preparation
    const processedInput = scrapedData.map(row => {
        // Remove course suffix
        const courseName = row.curso.split(' -')[0];
        // Create the 'shortname' used across different files, removing "Turma "
        const courseShortName = `${row.codigo} - ${row.componente} - ${row.turma.replace('Turma ', '')} - ${category}`;
        
        return {
            ...row,
            curso: courseName,
            'Curso ShortName': courseShortName,
            nome: row.nome.split('\n')[0].replace('\r', ''), // Clean student name
        };
    });

    // 2. Process Entities
    const {
        finalStudents,
        notFoundStudents,
        toSwapStudents,
        postgresStudents,
    } = await processStudents(processedInput);

    const {
        finalProfessors,
        notFoundProfessors,
    } = await processProfessors(processedInput);

    const classData = processClasses(processedInput, category);

    // 3. Combine for 'Usuarios' file
    const allUsers = uniteData(finalStudents, finalProfessors);

    // 4. Generate CSV content
    const files: CSVFile[] = [
        { filename: `Turmas-${category}.csv`, content: toCSV(classData, ['shortname', 'fullname', 'category_idnumber']) },
        { filename: `Alunos-${category}.csv`, content: toCSV(finalStudents, ['username', 'firstname', 'lastname', 'email', 'role1', 'course1']) },
        { filename: `Alunos-NãoCadastrados-${category}.csv`, content: toCSV(notFoundStudents, ['Matrícula', 'Nome', 'Curso', 'Tipo de Reserva', 'CPF']) },
        { filename: `Alunos-Pre-Postegres-${category}.csv`, content: toCSV(postgresStudents, ['Matrícula', 'Nome', 'Curso']) },
        { filename: `Alunos-TrocarMatricula-${category}.csv`, content: toCSV(toSwapStudents, ['Matrícula', 'Nome', 'Curso', 'Tipo de Reserva', 'CPF', 'MatriculaAntiga', 'CursoAntigo', 'Semestre', 'Siape']) },
        { filename: `Professores-${category}.csv`, content: toCSV(finalProfessors, ['username', 'firstname', 'lastname', 'email', 'role1', 'course1']) },
        { filename: `Professores-NãoCadastrados-${category}.csv`, content: toCSV(notFoundProfessors, ['nome', 'cpf', 'course1']) },
        { filename: `Usuarios-${category}.csv`, content: toCSV(allUsers, ['username', 'firstname', 'lastname', 'email', 'role1', 'course1']) },
    ];

    return files;
}
