export function processClasses(data: any[], category: string) {
    // Get unique classes based on the generated shortname
    const uniqueClasses = Array.from(new Map(data.map(item => [item['Curso ShortName'], item])).values());

    const classData = uniqueClasses.map(row => ({
        shortname: row['Curso ShortName'],
        fullname: row['Curso ShortName'],
        category_idnumber: category,
    }));

    return classData;
}
