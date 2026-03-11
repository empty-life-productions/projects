import redis from './redis';
import { IPL_PLAYERS } from '@/data/players';
import { RETENTION_POOL } from '@/data/retentionPool';

// ─── Constants ────────────────────────────────────────────────────────────────
export const MAX_RETENTIONS = 6;
export const MAX_CAPPED_RETENTIONS = 5;
export const MAX_UNCAPPED_RETENTIONS = 2;
export const MAX_OVERSEAS_RETENTIONS = 2;
export const RETENTION_TIMER_SECONDS = 300; // 5 minutes
export const CAPPED_RETENTION_COSTS = [18, 14, 11, 18, 14]; // Cr for capped slots
export const UNCAPPED_RETENTION_COST = 4; // Cr flat for uncapped
export const INITIAL_PURSE = 120; // Cr

// ─── Types ────────────────────────────────────────────────────────────────────
export interface RetainedPlayer {
    playerId: string;       // matches IPL_PLAYERS id
    playerName: string;
    role: string;
    nationality: 'Indian' | 'Overseas';
    slot: number;           // 1..4
    cost: number;           // Cr
}

export interface RetentionTeamState {
    userId: string;
    username: string;
    teamName: string;
    teamId?: string;
    purse: number;
    retained: RetainedPlayer[];
    confirmed: boolean;
    confirmedAt?: number;
}

export interface RetentionState {
    roomCode: string;
    teams: RetentionTeamState[];
    timerEnd: number;
    allConfirmed: boolean;
    startedAt: number;
}

// ─── Redis helpers ────────────────────────────────────────────────────────────
const redisKey = (roomCode: string) => `retention:${roomCode}`;

export async function getRetentionState(roomCode: string): Promise<RetentionState | null> {
    const raw = await redis.get(redisKey(roomCode));
    if (!raw) return null;
    return JSON.parse(raw);
}

async function saveRetentionState(roomCode: string, state: RetentionState): Promise<void> {
    await redis.set(redisKey(roomCode), JSON.stringify(state), 'EX', 86400);
}

// ─── Match player name → IPL_PLAYERS id ──────────────────────────────────────
function resolvePlayerId(playerName: string): string | null {
    const normalized = playerName.trim().toLowerCase();
    const match = IPL_PLAYERS.find(p => p.name.toLowerCase() === normalized);
    return match?.id ?? null;
}

// ─── initRetention ───────────────────────────────────────────────────────────
export async function initRetention(
    roomCode: string,
    players: { userId: string; username: string; teamName?: string; teamId?: string }[]
): Promise<RetentionState> {
    const now = Date.now();

    const teams: RetentionTeamState[] = players.map(p => ({
        userId: p.userId,
        username: p.username,
        teamName: p.teamName || '',
        teamId: p.teamId,
        purse: INITIAL_PURSE,
        retained: [],
        confirmed: false,
    }));

    const state: RetentionState = {
        roomCode,
        teams,
        timerEnd: now + RETENTION_TIMER_SECONDS * 1000,
        allConfirmed: false,
        startedAt: now,
    };

    await saveRetentionState(roomCode, state);
    return state;
}

// ─── retainPlayer ─────────────────────────────────────────────────────────────
export interface RetentionResult {
    success: boolean;
    error?: string;
    state: RetentionState;
}

export async function retainPlayer(
    roomCode: string,
    userId: string,
    playerName: string
): Promise<RetentionResult> {
    const state = await getRetentionState(roomCode);
    if (!state) return { success: false, error: 'Retention phase not active', state: {} as RetentionState };

    const team = state.teams.find(t => t.userId === userId);
    if (!team) return { success: false, error: 'Team not found', state };

    if (team.confirmed) return { success: false, error: 'Retentions already confirmed', state };

    // Timer check
    if (Date.now() > state.timerEnd) {
        return { success: false, error: 'Retention timer has expired', state };
    }

    // Resolve player from pool and IPL_PLAYERS
    const pool = RETENTION_POOL[team.teamName] ?? [];
    const eligible = pool.find(p => p.name.toLowerCase() === playerName.trim().toLowerCase());
    if (!eligible) {
        return { success: false, error: `${playerName} is not in ${team.teamName}'s retention pool`, state };
    }

    // Resolve to IPL_PLAYERS id
    const playerId = resolvePlayerId(playerName);
    if (!playerId) {
        return { success: false, error: `${playerName} could not be matched in the player database`, state };
    }

    // Total limit
    if (team.retained.length >= MAX_RETENTIONS) {
        return { success: false, error: `Maximum ${MAX_RETENTIONS} total retentions allowed`, state };
    }

    // Category limits
    const isUncapped = eligible.capStatus === 'Uncapped';
    const uncappedCount = team.retained.filter(r => {
        const p = pool.find(pl => pl.name === r.playerName);
        return p?.capStatus === 'Uncapped';
    }).length;
    const cappedCount = team.retained.length - uncappedCount;

    if (isUncapped && uncappedCount >= MAX_UNCAPPED_RETENTIONS) {
        return { success: false, error: `Maximum ${MAX_UNCAPPED_RETENTIONS} uncapped retentions allowed`, state };
    }
    if (!isUncapped && cappedCount >= MAX_CAPPED_RETENTIONS) {
        return { success: false, error: `Maximum ${MAX_CAPPED_RETENTIONS} capped retentions allowed`, state };
    }

    // Overseas limit
    if (eligible.nationality === 'Overseas') {
        const overseasCount = team.retained.filter(r => r.nationality === 'Overseas').length;
        if (overseasCount >= MAX_OVERSEAS_RETENTIONS) {
            return { success: false, error: `Maximum ${MAX_OVERSEAS_RETENTIONS} overseas retentions allowed`, state };
        }
    }

    // Already retained?
    if (team.retained.some(r => r.playerName.toLowerCase() === playerName.trim().toLowerCase())) {
        return { success: false, error: `${playerName} is already retained`, state };
    }

    // Check not retained by another team
    const alreadyRetainedByOther = state.teams.some(
        t => t.userId !== userId && t.retained.some(r => r.playerId === playerId)
    );
    if (alreadyRetainedByOther) {
        return { success: false, error: `${playerName} has already been retained by another team`, state };
    }

    let cost = 0;
    let slot = team.retained.length + 1;

    if (isUncapped) {
        cost = UNCAPPED_RETENTION_COST;
    } else {
        // Capped costs based on how many capped players already retained
        cost = CAPPED_RETENTION_COSTS[cappedCount] || 12; // fallback if somehow exceeds
    }

    if (team.purse < cost) {
        return { success: false, error: `Insufficient purse. Need ₹${cost} Cr, have ₹${team.purse} Cr`, state };
    }

    team.retained.push({
        playerId,
        playerName: eligible.name,
        role: eligible.role,
        nationality: eligible.nationality,
        slot,
        cost,
    });

    // Final purse recalculation to avoid floating point drift
    const totalCost = team.retained.reduce((sum, r) => sum + r.cost, 0);
    team.purse = Math.round((INITIAL_PURSE - totalCost) * 100) / 100;

    await saveRetentionState(roomCode, state);
    return { success: true, state };
}

// ─── releasePlayer ────────────────────────────────────────────────────────────
export async function releasePlayer(
    roomCode: string,
    userId: string,
    playerId: string
): Promise<RetentionResult> {
    const state = await getRetentionState(roomCode);
    if (!state) return { success: false, error: 'Retention phase not active', state: {} as RetentionState };

    const team = state.teams.find(t => t.userId === userId);
    if (!team) return { success: false, error: 'Team not found', state };
    if (team.confirmed) return { success: false, error: 'Retentions already confirmed', state };

    const idx = team.retained.findIndex(r => r.playerId === playerId);
    if (idx === -1) return { success: false, error: 'Player not found in retained list', state };

    team.retained.splice(idx, 1);

    // Re-calculate costs and slots from scratch based on remaining players
    const pool = RETENTION_POOL[team.teamName] ?? [];
    let cappedFound = 0;

    team.retained.forEach((r, i) => {
        const pInfo = pool.find(p => p.name === r.playerName);
        const isUncapped = pInfo?.capStatus === 'Uncapped';

        r.slot = i + 1;
        if (isUncapped) {
            r.cost = UNCAPPED_RETENTION_COST;
        } else {
            r.cost = CAPPED_RETENTION_COSTS[cappedFound] || 12;
            cappedFound++;
        }
    });

    const totalCost = team.retained.reduce((sum, r) => sum + r.cost, 0);
    team.purse = Math.round((INITIAL_PURSE - totalCost) * 100) / 100;

    await saveRetentionState(roomCode, state);
    return { success: true, state };
}

// ─── confirmRetentions ────────────────────────────────────────────────────────
export async function confirmRetentions(
    roomCode: string,
    userId: string
): Promise<RetentionResult> {
    const state = await getRetentionState(roomCode);
    if (!state) return { success: false, error: 'Retention phase not active', state: {} as RetentionState };

    const team = state.teams.find(t => t.userId === userId);
    if (!team) return { success: false, error: 'Team not found', state };

    team.confirmed = true;
    team.confirmedAt = Date.now();

    // Check if all teams confirmed
    state.allConfirmed = state.teams.every(t => t.confirmed);

    await saveRetentionState(roomCode, state);
    return { success: true, state };
}

// ─── autoFinalizeIfExpired ────────────────────────────────────────────────────
// Call this on every GET — if timer expired, confirm all pending teams
export async function autoFinalizeIfExpired(roomCode: string): Promise<RetentionState | null> {
    const state = await getRetentionState(roomCode);
    if (!state || state.allConfirmed) return state;

    if (Date.now() > state.timerEnd) {
        let changed = false;
        for (const team of state.teams) {
            if (!team.confirmed) {
                team.confirmed = true;
                team.confirmedAt = Date.now();
                changed = true;
            }
        }
        if (changed) {
            state.allConfirmed = true;
            await saveRetentionState(roomCode, state);
        }
    }

    return state;
}

// ─── getRetainedPlayerIds ─────────────────────────────────────────────────────
// Used by auction engine to exclude retained players
export async function getRetainedPlayerIds(roomCode: string): Promise<string[]> {
    const state = await getRetentionState(roomCode);
    if (!state) return [];
    return state.teams.flatMap(t => t.retained.map(r => r.playerId));
}

// ─── getRetentionEligiblePool ─────────────────────────────────────────────────
// Returns the eligible pool for a given team name, enriched with IPL_PLAYERS skill data
export function getRetentionEligiblePool(teamName: string) {
    const pool = (teamName && RETENTION_POOL[teamName]) ? RETENTION_POOL[teamName] : [];
    return pool.map(p => {
        if (!p) return null;
        const iplPlayer = IPL_PLAYERS.find(ip => ip.name && p.name && ip.name.toLowerCase() === p.name.toLowerCase());
        return {
            ...p,
            playerId: iplPlayer?.id ?? null,
            battingSkill: iplPlayer?.battingSkill ?? 50,
            bowlingSkill: iplPlayer?.bowlingSkill ?? 50,
        };
    }).filter(Boolean);
}
