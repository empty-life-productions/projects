import XLSX from 'xlsx';
import path from 'path';

const files = process.argv.slice(2);

files.forEach(file => {
    const workbook = XLSX.readFile(file);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    console.log(`\n--- File: ${file} ---`);
    if (data.length > 0) {
        console.log('Columns:', Object.keys(data[0]));
        console.log('First Row:', data[0]);
    } else {
        console.log('No data found.');
    }
});
