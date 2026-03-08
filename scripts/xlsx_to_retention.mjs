/**
 * xlsx_to_retention.mjs
 * Parses IPL_2026_Retention_Dataset (1).xlsx → data/retentionPool.ts
 * Run: node scripts/xlsx_to_retention.mjs
 */

import xlsx from 'xlsx';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const wb = xlsx.readFile(join(rootDir, 'IPL_2026_Retention_Dataset_Complete (2).xlsx'));

// ─── Nat normalization ────────────────────────────────────────────────────────
function normalizeNat(nat) {
    return nat?.trim() === 'Indian' ? 'Indian' : 'Overseas';
}

// ─── Role normalization ───────────────────────────────────────────────────────
function normalizeRole(role) {
    switch (role?.trim()) {
        case 'Batsman': return 'BATSMAN';
        case 'Bowler': return 'BOWLER';
        case 'All-Rounder': return 'ALL_ROUNDER';
        case 'Wicket-Keeper': return 'WICKET_KEEPER';
        default: return 'BATSMAN';
    }
}

const pool = {};
const ws = wb.Sheets[wb.SheetNames[0]];
const data = xlsx.utils.sheet_to_json(ws, { header: 1 });

// Row 0 = title, Row 1 = headers, Row 2+ = data
const rows = data.slice(2).filter(r => r[1] && typeof r[1] === 'string');

for (const r of rows) {
    const teamName = String(r[1]).trim();
    if (!pool[teamName]) pool[teamName] = [];

    pool[teamName].push({
        name: String(r[2]).trim(),
        role: normalizeRole(r[3]),
        nationality: normalizeNat(r[4]),
        auctionPrice2025: 0, // Not present in the new dataset
        capStatus: r[8] === 'Capped' ? 'Capped' : 'Uncapped',
    });
}

for (const teamName in pool) {
    console.log(`${teamName}: ${pool[teamName].length} eligible players`);
}

// ─── Generate TypeScript file ─────────────────────────────────────────────────
const lines = [
    `// Auto-generated from IPL_2026_Retention_Dataset_Complete (2).xlsx — do not edit manually`,
    `// Run: node scripts/xlsx_to_retention.mjs`,
    ``,
    `export type PlayerRole = 'BATSMAN' | 'BOWLER' | 'ALL_ROUNDER' | 'WICKET_KEEPER';`,
    ``,
    `export interface RetentionEligiblePlayer {`,
    `    name: string;`,
    `    role: PlayerRole;`,
    `    nationality: 'Indian' | 'Overseas';`,
    `    auctionPrice2025: number; // ₹ Cr — display only`,
    `    capStatus: 'Capped' | 'Uncapped';`,
    `}`,
    ``,
    `export const RETENTION_POOL: Record<string, RetentionEligiblePlayer[]> = {`,
];

for (const [team, players] of Object.entries(pool)) {
    lines.push(`    ${JSON.stringify(team)}: [`);
    for (const p of players) {
        lines.push(`        { name: ${JSON.stringify(p.name)}, role: '${p.role}', nationality: '${p.nationality}', auctionPrice2025: ${p.auctionPrice2025}, capStatus: '${p.capStatus}' },`);
    }
    lines.push(`    ],`);
}

lines.push(`};`, ``);

const outPath = join(rootDir, 'data', 'retentionPool.ts');
writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log(`\n✅ Generated ${outPath}`);
const total = Object.values(pool).reduce((s, arr) => s + arr.length, 0);
console.log(`Total eligible players across all teams: ${total}`);
