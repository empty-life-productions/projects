import redis from './redis';
import { CricketPlayer, IPL_PLAYERS } from '@/data/players';

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

    // ── SET 1: Marquee Players (₹2 Cr base, top skill) ──
    const marquee = pick(
        p => p.basePrice >= 2 && Math.max(p.battingSkill, p.bowlingSkill) >= 85,
        byBasePriceDesc
    );

    // ── SET 2: Capped Indian Batsmen ──
    const cappedIndianBat = pick(
        p => p.nationality === 'Indian' && p.role === 'BATSMAN' && p.basePrice >= 0.5,
        byBasePriceDesc
    );

    // ── SET 3: Capped Indian All-Rounders ──
    const cappedIndianAR = pick(
        p => p.nationality === 'Indian' && p.role === 'ALL_ROUNDER' && p.basePrice >= 0.5,
        byBasePriceDesc
    );

    // ── SET 4: Capped Indian Bowlers ──
    const cappedIndianBowl = pick(
        p => p.nationality === 'Indian' && p.role === 'BOWLER' && p.basePrice >= 0.5,
        byBasePriceDesc
    );

    // ── SET 5: Capped Indian Wicket-Keepers ──
    const cappedIndianWK = pick(
        p => p.nationality === 'Indian' && p.role === 'WICKET_KEEPER' && p.basePrice >= 0.5,
        byBasePriceDesc
    );

    // ── SET 6: Overseas Batsmen ──
    const overseasBat = pick(
        p => p.nationality === 'Overseas' && p.role === 'BATSMAN' && p.basePrice >= 0.5,
        byBasePriceDesc
    );

    // ── SET 7: Overseas All-Rounders ──
    const overseasAR = pick(
        p => p.nationality === 'Overseas' && p.role === 'ALL_ROUNDER' && p.basePrice >= 0.5,
        byBasePriceDesc
    );

    // ── SET 8: Overseas Bowlers ──
    const overseasBowl = pick(
        p => p.nationality === 'Overseas' && p.role === 'BOWLER' && p.basePrice >= 0.5,
        byBasePriceDesc
    );

    // ── SET 9: Overseas Wicket-Keepers ──
    const overseasWK = pick(
        p => p.nationality === 'Overseas' && p.role === 'WICKET_KEEPER' && p.basePrice >= 0.3,
        byBasePriceDesc
    );

    // ── SET 10: Uncapped / Emerging Indians ──
    const uncappedIndian = pick(
        p => p.nationality === 'Indian' && !used.has(p.id),
        byBasePriceDesc
    );

    // ── SET 11: Remaining Overseas ──
    const remainingOverseas = pick(
        p => p.nationality === 'Overseas' && !used.has(p.id),
        byBasePriceDesc
    );

    // ── SET 12: Accelerated — anyone left ──
    const accelerated = pick(
        () => true,
        byBasePriceDesc
    );

    const sets: AuctionSet[] = [];

    const addSet = (id: string, name: string, shortName: string, desc: string, emoji: string, color: string, pList: CricketPlayer[]) => {
        if (pList.length === 0) return;

        // Split into chunks of 8
        const CHUNK_SIZE = 8;
        for (let i = 0; i < pList.length; i += CHUNK_SIZE) {
            const chunk = pList.slice(i, i + CHUNK_SIZE);
            const slotNum = Math.floor(i / CHUNK_SIZE) + 1;
            const slotSuffix = pList.length > CHUNK_SIZE ? ` SET ${slotNum}` : '';

            sets.push({
                id: `${id}-${slotNum}`,
                name: `${name}${slotSuffix}`,
                shortName: `${shortName}${slotSuffix}`,
                description: desc,
                emoji,
                color,
                players: chunk
            });
        }
    };

    addSet('marquee', 'Marquee Set', 'MARQUEE', 'Elite players', '👑', '#FFD700', marquee);
    addSet('ind-bat', 'Capped Indian Batsmen', 'IND BAT', 'Indian batting stars', '🏏', '#4FC3F7', cappedIndianBat);
    addSet('ind-ar', 'Capped Indian All-Rounders', 'IND AR', 'Indian all-rounders', '⭐', '#66BB6A', cappedIndianAR);
    addSet('ind-bowl', 'Capped Indian Bowlers', 'IND BOWL', 'Indian bowling attack', '🎯', '#EF5350', cappedIndianBowl);
    addSet('ind-wk', 'Capped Indian Wicket-Keepers', 'IND WK', 'Indian keepers', '🧤', '#FFA726', cappedIndianWK);
    addSet('ovs-bat', 'Overseas Batsmen', 'OVS BAT', 'Global batting talent', '🌍', '#4FC3F7', overseasBat);
    addSet('ovs-ar', 'Overseas All-Rounders', 'OVS AR', 'Global all-rounders', '🌟', '#66BB6A', overseasAR);
    addSet('ovs-bowl', 'Overseas Bowlers', 'OVS BOWL', 'Global bowling stars', '🔥', '#EF5350', overseasBowl);
    addSet('ovs-wk', 'Overseas Wicket-Keepers', 'OVS WK', 'Global keepers', '🥊', '#FFA726', overseasWK);
    addSet('uncapped', 'Uncapped Indians', 'UNCAPPED', 'Emerging Indian talent', '🌱', '#81C784', uncappedIndian);
    addSet('ovs-rem', 'Remaining Overseas', 'OVS REM', 'Overseas depth players', '🌐', '#90CAF9', remainingOverseas);
    addSet('accel', 'Accelerated Round', 'ACCEL', 'Final round — all remaining', '⚡', '#CE93D8', accelerated);

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

export async function initAuction(
    roomCode: string,
    players: { userId: string; username: string; teamName: string; startingPurse?: number }[],
    excludePlayerIds: string[] = []
): Promise<AuctionState> {
    const excludeIds = new Set(excludePlayerIds);
    const auctionSets = buildAuctionSets(excludeIds);

    // Flatten all players from sets to get remaining players for the first set
    const allPlayersFlat: CricketPlayer[] = [];
    auctionSets.forEach(s => allPlayersFlat.push(...s.players));

    const teams: AuctionTeam[] = players.map(p => ({
        userId: p.userId,
        username: p.username,
        teamName: p.teamName,
        purse: p.startingPurse ?? INITIAL_PURSE,
        maxPurse: p.startingPurse ?? INITIAL_PURSE,
        squad: [],
        maxSquadSize: MAX_SQUAD_SIZE,
        rtmCardsUsed: 0,
        maxRtmCards: MAX_RTM_CARDS,
    }));

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
        return { success: false, error: 'Squad is full', state };
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

export async function skipPlayer(roomCode: string): Promise<AuctionState | null> {
    const state = await getAuctionState(roomCode);
    if (!state || !state.currentPlayer) return null;

    state.unsoldPlayers.push(state.currentPlayer);
    state.status = 'unsold';
    state.timerEnd = null;

    await saveAuctionState(roomCode, state);
    return state;
}

export async function skipSet(roomCode: string): Promise<AuctionState | null> {
    const state = await getAuctionState(roomCode);
    if (!state) return null;

    if (state.currentPlayer && state.status === 'bidding') {
        state.unsoldPlayers.push(state.currentPlayer);
    }
    for (const p of state.remainingPlayers) {
        state.unsoldPlayers.push(p);
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

export async function getAuctionState(roomCode: string): Promise<AuctionState | null> {
    const raw = await redis.get(`auction:${roomCode}`);
    if (!raw) return null;
    return JSON.parse(raw);
}

export async function saveAuctionState(roomCode: string, state: AuctionState): Promise<void> {
    await redis.set(`auction:${roomCode}`, JSON.stringify(state), 'EX', 86400);
}

export { BID_INCREMENT, BID_TIMER_SECONDS, INITIAL_PURSE, MAX_SQUAD_SIZE };
