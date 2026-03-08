import XLSX from 'xlsx';

const file = 'IPL_2026_Retention_Dataset_Complete (2).xlsx';
const workbook = XLSX.readFile(file);
const worksheet = workbook.Sheets[workbook.SheetNames[0]];
const raw = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

const rows = raw.slice(2); // Skip Row 1 (Title) and Row 2 (Headers)

const teamColumn = 1;
const nameColumn = 2;
const noteColumn = 9;

const notes = new Set();
const samples = [];

rows.forEach(r => {
    if (r[noteColumn]) {
        notes.add(String(r[noteColumn]).trim());
    }
    if (samples.length < 5) {
        samples.push({
            team: r[teamColumn],
            name: r[nameColumn],
            note: r[noteColumn]
        });
    }
});

console.log('Unique Notes:', Array.from(notes));
console.log('Sample Rows:', samples);
