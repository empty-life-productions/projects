import redis from './redis';
import { CricketPlayer, IPL_PLAYERS } from '@/data/players';
import { analyzeSquadNeeds, canAddOverseas, getSquadComposition } from './squadUtils';

// ======================================================
// IPL-Style Auction Slot Definitions
// ======================================================

export interface AuctionSet {
    id: string;
    name: string;
    shortName: string;
    description: string;
    emoji: string;
    color: string;
    players: CricketPlayer[];
}

/**
 * Organize 250 players into IPL-style auction sets
 * Order: Marquee → Capped Indian (by role) → Overseas (by role) → Uncapped → Accelerated
 */
function buildAuctionSets(excludeIds: Set<string> = new Set()): AuctionSet[] {
    const all = [...IPL_PLAYERS].filter(p => !excludeIds.has(p.id));
    const used = new Set<string>();

    const pick = (filter: (p: CricketPlayer) => boolean, sort?: (a: CricketPlayer, b: CricketPlayer) => number): CricketPlayer[] => {
        const matched = all.filter(p => !used.has(p.id) && filter(p));
        if (sort) matched.sort(sort);
        matched.forEach(p => used.add(p.id));
        return matched;
    };

    const bySkillDesc = (a: CricketPlayer, b: CricketPlayer) =>
        Math.max(b.battingSkill, b.bowlingSkill) - Math.max(a.battingSkill, a.bowlingSkill);

    const byBasePriceDesc = (a: CricketPlayer, b: CricketPlayer) =>
        b.basePrice - a.basePrice || bySkillDesc(a, b);

    // Categories
    const categories = [
        { id: 'marquee', name: 'Marquee', short: 'MARQUEE', emoji: '👑', color: '#FFD700', filter: (p: CricketPlayer) => p.basePrice >= 2 && Math.max(p.battingSkill, p.bowlingSkill) >= 85 },
        { id: 'ind-bat', name: 'Capped Indian Batsmen', short: 'IND BAT', emoji: '🏏', color: '#4FC3F7', filter: (p: CricketPlayer) => p.nationality === 'Indian' && p.role === 'BATSMAN' && p.basePrice >= 0.5 },
        { id: 'ind-ar', name: 'Capped Indian All-Rounders', short: 'IND AR', emoji: '⭐', color: '#66BB6A', filter: (p: CricketPlayer) => p.nationality === 'Indian' && p.role === 'ALL_ROUNDER' && p.basePrice >= 0.5 },
        { id: 'ind-bowl', name: 'Capped Indian Bowlers', short: 'IND BOWL', emoji: '🎯', color: '#EF5350', filter: (p: CricketPlayer) => p.nationality === 'Indian' && p.role === 'BOWLER' && p.basePrice >= 0.5 },
        { id: 'ind-wk', name: 'Capped Indian Wicket-Keepers', short: 'IND WK', emoji: '🧤', color: '#FFA726', filter: (p: CricketPlayer) => p.nationality === 'Indian' && p.role === 'WICKET_KEEPER' && p.basePrice >= 0.5 },
        { id: 'ovs-bat', name: 'Overseas Batsmen', short: 'OVS BAT', emoji: '🌍', color: '#4FC3F7', filter: (p: CricketPlayer) => p.nationality === 'Overseas' && p.role === 'BATSMAN' && p.basePrice >= 0.5 },
        { id: 'ovs-ar', name: 'Overseas All-Rounders', short: 'OVS AR', emoji: '🌟', color: '#66BB6A', filter: (p: CricketPlayer) => p.nationality === 'Overseas' && p.role === 'ALL_ROUNDER' && p.basePrice >= 0.5 },
        { id: 'ovs-bowl', name: 'Overseas Bowlers', short: 'OVS BOWL', emoji: '🔥', color: '#EF5350', filter: (p: CricketPlayer) => p.nationality === 'Overseas' && p.role === 'BOWLER' && p.basePrice >= 0.5 },
        { id: 'ovs-wk', name: 'Overseas Wicket-Keepers', short: 'OVS WK', emoji: '🥊', color: '#FFA726', filter: (p: CricketPlayer) => p.nationality === 'Overseas' && p.role === 'WICKET_KEEPER' && p.basePrice >= 0.3 },
        { id: 'uncapped', name: 'Uncapped Indians', short: 'UNCAPPED', emoji: '🌱', color: '#81C784', filter: (p: CricketPlayer) => p.nationality === 'Indian' },
        { id: 'ovs-rem', name: 'Remaining Overseas', short: 'OVS REM', emoji: '🌐', color: '#90CAF9', filter: (p: CricketPlayer) => p.nationality === 'Overseas' },
    ];

    // Pre-partition players into category pools
    const pools: Record<string, CricketPlayer[]> = {};
    categories.forEach(cat => {
        pools[cat.id] = pick(cat.filter, byBasePriceDesc);
    });

    // Add remaining players to 'Accelerated'
    const acceleratedP = pick(() => true, byBasePriceDesc);
    pools['accel'] = acceleratedP;
    categories.push({ id: 'accel', name: 'Accelerated Round', short: 'ACCEL', emoji: '⚡', color: '#CE93D8', filter: () => true });

    const sets: AuctionSet[] = [];
    const CHUNK_SIZE = 8;
    const counters: Record<string, number> = {};

    // Mixed Set Logic: Alternate through categories
    // We keep going until all pools are empty
    let hasMore = true;
    while (hasMore) {
        hasMore = false;
        for (const cat of categories) {
            const pool = pools[cat.id];
            if (pool && pool.length > 0) {
                const chunk = pool.splice(0, CHUNK_SIZE);
                counters[cat.id] = (counters[cat.id] || 0) + 1;
                const setNum = counters[cat.id];

                sets.push({
                    id: `${cat.id}-${setNum}`,
                    name: `${cat.name}${pool.length > 0 || setNum > 1 ? ` SET ${setNum}` : ''}`,
                    shortName: `${cat.short}${pool.length > 0 || setNum > 1 ? ` SET ${setNum}` : ''}`,
                    description: `IPL 2026 ${cat.name} pool`,
                    emoji: cat.emoji,
                    color: cat.color,
                    players: chunk
                });
                hasMore = true;
            }
        }
    }

    return sets;
}

// ======================================================
// Auction State & Interfaces
// ======================================================

export interface AuctionState {
    roomCode: string;
    status: 'idle' | 'bidding' | 'sold' | 'unsold' | 'completed';
    currentPlayer: CricketPlayer | null;
    currentBid: number;
    currentBidder: { userId: string; username: string; teamName: string } | null;
    remainingPlayers: CricketPlayer[];
    soldPlayers: SoldPlayer[];
    unsoldPlayers: CricketPlayer[];
    teams: AuctionTeam[];
    timerEnd: number | null;
    round: number;
    currentPlayerIndex: number;
    // Slot-based auction fields
    auctionSets: AuctionSet[];
    currentSetIndex: number;
    currentSetPlayerIndex: number;
    totalPlayers: number;
    // RTM state
    rtmPending: boolean;
    rtmOriginalTeamId: string | null;
}

export interface SoldPlayer {
    player: CricketPlayer;
    soldTo: { userId: string; username: string; teamName: string };
    soldPrice: number;
}

export interface AuctionTeam {
    userId: string;
    username: string;
    teamName: string;
    purse: number;
    maxPurse: number;
    squad: SoldPlayer[];
    maxSquadSize: number;
    rtmCardsUsed: number;
    maxRtmCards: number;
}

const INITIAL_PURSE = 120; // Cr
const MAX_SQUAD_SIZE = 25;
const BID_INCREMENT = 0.25;
const BID_TIMER_SECONDS = 15;
const MAX_RTM_CARDS = 3;

export interface AuctionEnrichedTeam {
    userId: string;
    username: string;
    teamName: string;
    purse: number;
    retained: { playerId: string; playerName: string; role: string; cost: number }[];
}

export async function initAuction(
    roomCode: string,
    teamsData: AuctionEnrichedTeam[],
    excludePlayerIds: string[] = []
): Promise<AuctionState> {
    const excludeIds = new Set(excludePlayerIds);
    const auctionSets = buildAuctionSets(excludeIds);

    // Flatten all players from sets to get remaining players for the first set
    const allPlayersFlat: CricketPlayer[] = [];
    auctionSets.forEach(s => allPlayersFlat.push(...s.players));

    const teams: AuctionTeam[] = teamsData.map(p => {
        const { RETENTION_POOL } = require('@/data/retentionPool');
        // Map retained players to SoldPlayer format
        const retainedSold: SoldPlayer[] = p.retained.map(r => {
            const player = IPL_PLAYERS.find(ip => ip.id === r.playerId)!;
            return {
                player,
                soldTo: { userId: p.userId, username: p.username, teamName: p.teamName },
                soldPrice: r.cost
            };
        });

        const pool = RETENTION_POOL[p.teamName] ?? [];
        const cappedRetainedCount = p.retained.filter(r => {
            const player = IPL_PLAYERS.find(ip => ip.id === r.playerId);
            const eligible = pool.find((pl: any) => pl.name === player?.name);
            return eligible?.capStatus === 'Capped';
        }).length;

        return {
            userId: p.userId,
            username: p.username,
            teamName: p.teamName,
            purse: p.purse,
            maxPurse: INITIAL_PURSE,
            squad: retainedSold,
            maxSquadSize: MAX_SQUAD_SIZE,
            rtmCardsUsed: 0,
            // 6 - total retentions = remaining RTM opportunities
            maxRtmCards: Math.max(0, 6 - p.retained.length),
        };
    });

    const state: AuctionState = {
        roomCode,
        status: 'idle',
        currentPlayer: null,
        currentBid: 0,
        currentBidder: null,
        remainingPlayers: auctionSets.length > 0 ? [...auctionSets[0].players] : [],
        soldPlayers: [],
        unsoldPlayers: [],
        teams,
        timerEnd: null,
        round: 1,
        currentPlayerIndex: 0,
        auctionSets,
        currentSetIndex: 0,
        currentSetPlayerIndex: 0,
        totalPlayers: allPlayersFlat.length,
        rtmPending: false,
        rtmOriginalTeamId: null,
    };

    await saveAuctionState(roomCode, state);
    return state;
}

export async function nextPlayer(roomCode: string): Promise<AuctionState | null> {
    const state = await getAuctionState(roomCode);
    if (!state) return null;

    // If current set's players are exhausted, move to next set
    if (state.remainingPlayers.length === 0) {
        const nextSetIdx = state.currentSetIndex + 1;
        if (nextSetIdx >= state.auctionSets.length) {
            // All sets done
            state.status = 'completed';
            await saveAuctionState(roomCode, state);
            return state;
        }
        // Advance to next set
        state.currentSetIndex = nextSetIdx;
        state.currentSetPlayerIndex = 0;
        state.remainingPlayers = [...state.auctionSets[nextSetIdx].players];
    }

    const next = state.remainingPlayers.shift()!;
    state.currentPlayer = next;
    state.currentBid = next.basePrice;
    state.currentBidder = null;
    state.status = 'bidding';
    state.timerEnd = Date.now() + BID_TIMER_SECONDS * 1000;
    state.currentPlayerIndex++;
    state.currentSetPlayerIndex++;

    await saveAuctionState(roomCode, state);
    return state;
}

export interface BidResult {
    success: boolean;
    error?: string;
    state: AuctionState;
}

export async function placeBid(
    roomCode: string,
    userId: string,
    username: string,
    teamName: string,
    amount: number
): Promise<BidResult> {
    const state = await getAuctionState(roomCode);
    if (!state) return { success: false, error: 'Auction not found', state: {} as AuctionState };

    if (state.status !== 'bidding') {
        return { success: false, error: 'No active bidding', state };
    }

    const team = state.teams.find(t => t.userId === userId);
    if (!team) {
        return { success: false, error: 'Team not found', state };
    }

    if (team.squad.length >= team.maxSquadSize) {
        return { success: false, error: 'Squad is full (25 max)', state };
    }

    // IPL: max 8 overseas players per squad
    if (state.currentPlayer?.nationality === 'Overseas' && !canAddOverseas(team.squad)) {
        return { success: false, error: 'Overseas quota full (8 max)', state };
    }

    if (amount > team.purse) {
        return { success: false, error: 'Insufficient purse', state };
    }

    const minBid = state.currentBidder
        ? state.currentBid + BID_INCREMENT
        : state.currentPlayer!.basePrice;

    if (amount < minBid) {
        return { success: false, error: `Minimum bid is ₹${minBid} Cr`, state };
    }

    if (state.currentBidder?.userId === userId) {
        return { success: false, error: 'You are already the highest bidder', state };
    }

    state.currentBid = amount;
    state.currentBidder = { userId, username, teamName };
    state.timerEnd = Date.now() + BID_TIMER_SECONDS * 1000;

    await saveAuctionState(roomCode, state);
    return { success: true, state };
}

async function findOriginalTeam(playerName: string): Promise<string | null> {
    const { RETENTION_POOL } = await import('@/data/retentionPool');
    for (const [teamName, players] of Object.entries(RETENTION_POOL)) {
        if (players.some(p => p.name.toLowerCase() === playerName.toLowerCase())) {
            return teamName;
        }
    }
    return null;
}

export async function sellCurrentPlayer(roomCode: string): Promise<AuctionState | null> {
    const state = await getAuctionState(roomCode);
    if (!state || !state.currentPlayer) return null;

    if (state.currentBidder) {
        // Check for RTM eligibility
        const originalTeamName = await findOriginalTeam(state.currentPlayer.name);
        const originalTeam = state.teams.find(t => t.teamName === originalTeamName);

        // If there's an original team, they have RTM cards left, and they aren't the current bidder
        if (originalTeam &&
            originalTeam.rtmCardsUsed < originalTeam.maxRtmCards &&
            originalTeam.userId !== state.currentBidder.userId &&
            originalTeam.purse >= state.currentBid) {

            state.rtmPending = true;
            state.rtmOriginalTeamId = originalTeam.userId;
            await saveAuctionState(roomCode, state);
            return state;
        }

        const soldPlayer: SoldPlayer = {
            player: state.currentPlayer,
            soldTo: state.currentBidder,
            soldPrice: state.currentBid,
        };

        state.soldPlayers.push(soldPlayer);

        const team = state.teams.find(t => t.userId === state.currentBidder!.userId);
        if (team) {
            team.purse -= state.currentBid;
            team.purse = Math.round(team.purse * 100) / 100;
            team.squad.push(soldPlayer);
        }

        state.status = 'sold';
    } else {
        state.unsoldPlayers.push(state.currentPlayer);
        state.status = 'unsold';
    }

    state.timerEnd = null;
    await saveAuctionState(roomCode, state);
    return state;
}

export async function handleRtm(roomCode: string, execute: boolean): Promise<AuctionState | null> {
    const state = await getAuctionState(roomCode);
    if (!state || !state.rtmPending || !state.currentPlayer || !state.currentBidder) return null;

    const originalTeam = state.teams.find(t => t.userId === state.rtmOriginalTeamId);
    if (!originalTeam) return null;

    if (execute) {
        // Original team uses RTM
        const soldPlayer: SoldPlayer = {
            player: state.currentPlayer,
            soldTo: {
                userId: originalTeam.userId,
                username: originalTeam.username,
                teamName: originalTeam.teamName
            },
            soldPrice: state.currentBid,
        };
        state.soldPlayers.push(soldPlayer);
        originalTeam.purse -= state.currentBid;
        originalTeam.purse = Math.round(originalTeam.purse * 100) / 100;
        originalTeam.squad.push(soldPlayer);
        originalTeam.rtmCardsUsed++;
    } else {
        // RTM declined, goes to current highest bidder
        const soldPlayer: SoldPlayer = {
            player: state.currentPlayer,
            soldTo: state.currentBidder,
            soldPrice: state.currentBid,
        };
        state.soldPlayers.push(soldPlayer);
        const team = state.teams.find(t => t.userId === state.currentBidder!.userId);
        if (team) {
            team.purse -= state.currentBid;
            team.purse = Math.round(team.purse * 100) / 100;
            team.squad.push(soldPlayer);
        }
    }

    state.rtmPending = false;
    state.rtmOriginalTeamId = null;
    state.status = 'sold';
    state.timerEnd = null;
    await saveAuctionState(roomCode, state);
    return state;
}

// ======================================================
// Smart Skip & Bot Assignment
// ======================================================

async function assignToBestBot(p: CricketPlayer, teams: AuctionTeam[]) {
    const botTeams = teams.filter(t => BOT_USERNAMES_LOCAL.includes(t.username));

    // Filter bots that need this role most and have purse & squad space
    const matchedBots = botTeams
        .filter(t => {
            const comp = getSquadComposition(t.squad);
            if (comp.total >= 25) return false; // squad full
            if (p.nationality === 'Overseas' && !canAddOverseas(t.squad)) return false; // overseas quota
            return t.purse >= p.basePrice;
        })
        .map(t => {
            const needs = analyzeSquadNeeds(t.squad);
            const needScore = (needs[p.role] as number) || 1.0;
            return { team: t, score: needScore * Math.sqrt(t.purse) };
        })
        .sort((a, b) => b.score - a.score);

    return matchedBots[0]?.team ?? null;
}

/**
 * Calculate a realistic simulation price for a player being assigned via Smart Skip.
 * Price varies based on:
 *  - Player skill (higher skill → closer to market rate)
 *  - Team role need (higher urgency → pay a premium)
 *  - Available purse (capped so teams don't overspend)
 */
function simulateSkipPrice(player: CricketPlayer, team: AuctionTeam): number {
    const skill = Math.max(player.battingSkill, player.bowlingSkill);
    const needs = analyzeSquadNeeds(team.squad);
    const needMultiplier = Math.min(2.0, needs[player.role] ?? 1.0);

    // Skill multiplier: 0.5× at skill 50, up to 2.5× at skill 95+
    const skillMultiplier = 0.5 + ((skill - 50) / 45) * 2.0;

    // Estimated market price based on base + skill + need
    const estimatedPrice = player.basePrice * Math.max(1.0, skillMultiplier) * needMultiplier;

    // Add slight randomness (+/- 15%) to simulate competitive bidding
    const jitter = 0.85 + Math.random() * 0.30;
    const rawPrice = estimatedPrice * jitter;

    // Cap at 30% of bot's available purse so they don't bust
    const maxAffordable = team.purse * 0.30;
    const finalPrice = Math.max(player.basePrice, Math.min(rawPrice, maxAffordable));

    // Round to nearest 0.25 Cr increment (IPL style)
    return Math.round(finalPrice / BID_INCREMENT) * BID_INCREMENT;
}

export async function skipPlayer(roomCode: string): Promise<AuctionState | null> {
    const state = await getAuctionState(roomCode);
    if (!state || !state.currentPlayer) return null;

    const targetBot = await assignToBestBot(state.currentPlayer, state.teams);

    if (targetBot) {
        const price = simulateSkipPrice(state.currentPlayer, targetBot);
        const soldPlayer: SoldPlayer = {
            player: state.currentPlayer,
            soldTo: { userId: targetBot.userId, username: targetBot.username, teamName: targetBot.teamName },
            soldPrice: price,
        };
        targetBot.squad.push(soldPlayer);
        targetBot.purse -= price;
        targetBot.purse = Math.round(targetBot.purse * 100) / 100;
        state.soldPlayers.push(soldPlayer);
        state.status = 'sold';
    } else {
        state.unsoldPlayers.push(state.currentPlayer);
        state.status = 'unsold';
    }

    state.currentPlayer = null;
    state.currentBid = 0;
    state.currentBidder = null;
    state.timerEnd = null;

    await saveAuctionState(roomCode, state);
    return state;
}

export async function skipSet(roomCode: string): Promise<AuctionState | null> {
    const state = await getAuctionState(roomCode);
    if (!state) return null;

    const playersToSkip = [];
    if (state.currentPlayer) playersToSkip.push(state.currentPlayer);
    playersToSkip.push(...state.remainingPlayers);

    for (const p of playersToSkip) {
        const targetBot = await assignToBestBot(p, state.teams);
        if (targetBot) {
            const price = simulateSkipPrice(p, targetBot);
            const soldPlayer: SoldPlayer = {
                player: p,
                soldTo: { userId: targetBot.userId, username: targetBot.username, teamName: targetBot.teamName },
                soldPrice: price,
            };
            targetBot.squad.push(soldPlayer);
            targetBot.purse -= price;
            targetBot.purse = Math.round(targetBot.purse * 100) / 100;
            state.soldPlayers.push(soldPlayer);
        } else {
            state.unsoldPlayers.push(p);
        }
    }

    state.remainingPlayers = [];
    state.currentPlayer = null;
    state.status = 'idle';
    state.timerEnd = null;

    await saveAuctionState(roomCode, state);
    return state;
}

export async function endAuction(roomCode: string): Promise<AuctionState | null> {
    const state = await getAuctionState(roomCode);
    if (!state) return null;

    state.status = 'completed';
    state.timerEnd = null;

    await saveAuctionState(roomCode, state);
    return state;
}

// ======================================================
// State Persistence
// ======================================================

export async function getAuctionState(roomCode: string): Promise<AuctionState | null> {
    const raw = await redis.get(`auction:${roomCode}`);
    if (!raw) return null;
    return JSON.parse(raw);
}

export async function saveAuctionState(roomCode: string, state: AuctionState): Promise<void> {
    await redis.set(`auction:${roomCode}`, JSON.stringify(state), 'EX', 86400);
}

const BOT_USERNAMES_LOCAL = [
    'Chennai Super Kings', 'Mumbai Indians', 'Royal Challengers Bengaluru', 'Kolkata Knight Riders',
    'Delhi Capitals', 'Sunrisers Hyderabad', 'Punjab Kings', 'Rajasthan Royals',
    'Lucknow Super Giants', 'Gujarat Titans',
];

export { BID_INCREMENT, BID_TIMER_SECONDS, INITIAL_PURSE, MAX_SQUAD_SIZE };
