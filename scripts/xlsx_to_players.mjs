/**
 * xlsx_to_players.mjs
 * Converts IPL_2026_300_Players.xlsx into data/players.ts
 * Run: node scripts/xlsx_to_players.mjs
 */

import xlsx from 'xlsx';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// ─── Read the xlsx ──────────────────────────────────────────────────────────
const wb = xlsx.readFile(join(rootDir, 'IPL_2026_Auction_Dataset.xlsx'));
const ws = wb.Sheets[wb.SheetNames[0]];
const raw = xlsx.utils.sheet_to_json(ws, { header: 1 });

// Row 0 = title, 1 = headers, 2..301 = data
const headers = raw[1];
const rows = raw.slice(2);

// ─── Column indices ──────────────────────────────────────────────────────────
const COL = {
    id: 0,          // Player ID
    name: 1,        // Player Name
    team: 2,        // Team
    role: 3,        // Role
    nationality: 4, // Nationality
    age: 5,         // Age
    caps: 6,        // IPL Caps
    capStatus: 7,   // Cap Status
    basePrice: 8,   // Base Price (₹ Cr)
    status: 9,      // Registration Status
    battingSkill: 10,  // Batting Rating (0–100)
    bowlingSkill: 11,  // Bowling Rating (0–100)
};

// ─── Role mapping ────────────────────────────────────────────────────────────
function mapRole(xlsxRole) {
    switch (xlsxRole?.trim()) {
        case 'Batsman': return 'BATSMAN';
        case 'Bowler': return 'BOWLER';
        case 'All-Rounder': return 'ALL_ROUNDER';
        case 'Wicket-Keeper': return 'WICKET_KEEPER';
        default:
            return 'BATSMAN';
    }
}

// ─── Nationality mapping ─────────────────────────────────────────────────────
function mapNationality(nat) {
    return nat?.trim() === 'Indian' ? 'Indian' : 'Overseas';
}

// ─── Build CricketPlayer array ───────────────────────────────────────────────
const players = rows
    .filter(r => r[COL.name]) // skip empty rows
    .map((r, idx) => {
        const role = mapRole(r[COL.role]);
        const basePrice = Number(r[COL.basePrice]) || 0;

        // Use direct ratings if available, otherwise fallback to 50
        const battingSkill = Number(r[COL.battingSkill]) || 50;
        const bowlingSkill = Number(r[COL.bowlingSkill]) || 50;

        return {
            id: `p${idx + 1}`,
            name: String(r[COL.name]).trim(),
            role,
            battingSkill,
            bowlingSkill,
            basePrice,
            nationality: mapNationality(r[COL.nationality]),
        };
    });

// ─── Build the TypeScript file ────────────────────────────────────────────────
const lines = [
    `export interface CricketPlayer {`,
    `    id: string;`,
    `    name: string;`,
    `    role: 'BATSMAN' | 'BOWLER' | 'ALL_ROUNDER' | 'WICKET_KEEPER';`,
    `    battingSkill: number;`,
    `    bowlingSkill: number;`,
    `    basePrice: number;`,
    `    nationality: string;`,
    `    image?: string;`,
    `}`,
    ``,
    `// Auto-generated from IPL_2026_300_Players.xlsx — do not edit manually`,
    `export const IPL_PLAYERS: CricketPlayer[] = [`,
    ...players.map(p =>
        `    { id: '${p.id}', name: '${p.name}', role: '${p.role}', battingSkill: ${p.battingSkill}, bowlingSkill: ${p.bowlingSkill}, basePrice: ${p.basePrice}, nationality: '${p.nationality}' },`
    ),
    `];`,
    ``,
    `// Legacy export for backward compatibility`,
    `export const TEAM_NAMES = [`,
    `    'Chennai Super Kings',`,
    `    'Mumbai Indians',`,
    `    'Royal Challengers Bengaluru',`,
    `    'Kolkata Knight Riders',`,
    `    'Delhi Capitals',`,
    `    'Sunrisers Hyderabad',`,
    `    'Punjab Kings',`,
    `    'Rajasthan Royals',`,
    `    'Lucknow Super Giants',`,
    `    'Gujarat Titans',`,
    `];`,
    ``,
];

const output = lines.join('\n');
const outPath = join(rootDir, 'data', 'players.ts');
writeFileSync(outPath, output, 'utf8');

console.log(`✅ Generated ${players.length} players → ${outPath}`);
// Summary stats
const roles = {};
const nats = {};
players.forEach(p => {
    roles[p.role] = (roles[p.role] || 0) + 1;
    nats[p.nationality] = (nats[p.nationality] || 0) + 1;
});
console.log('Roles:', roles);
console.log('Nationalities:', nats);
console.log('Base prices:', [...new Set(players.map(p => p.basePrice))].sort((a, b) => a - b));
