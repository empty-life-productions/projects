import { AuctionState, AuctionTeam, placeBid, getAuctionState, sellCurrentPlayer, nextPlayer, BID_INCREMENT } from './auctionEngine';
import { CricketPlayer } from '@/data/players';
import { getRoomState } from './roomManager';
import type { MatchState, BatterState, BowlerState } from './matchEngine';

// ======================================================
// Bot Detection
// ======================================================

const BOT_USERNAMES = [
    'Captain_Dhoni', 'King_Kohli', 'Hitman_Rohit', 'KKR_Champion',
    'DC_Warrior', 'SRH_Sunriser', 'PBKS_Lion', 'RR_Royal',
    'LSG_Giant', 'GT_Titan',
];

export function isBotUser(username: string): boolean {
    return BOT_USERNAMES.includes(username);
}

export function isBotUserId(userId: string, teams: AuctionTeam[]): boolean {
    const team = teams.find(t => t.userId === userId);
    return team ? isBotUser(team.username) : false;
}

// ======================================================
// Bot Bidding Strategy
// ======================================================

interface BotPersonality {
    aggression: number;      // 0.4–1.3: affects bid probability
    maxOverpay: number;      // how much over base price they'll go (multiplier)
    rolePreferences: Record<string, number>; // multiplier for role desire
}

function generatePersonality(teamName: string): BotPersonality {
    // Seed based on team name for consistency
    const hash = teamName.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const aggression = 0.5 + (hash % 80) / 100; // 0.5 to 1.3

    return {
        aggression,
        maxOverpay: 2 + aggression * 2, // 3x to 4.6x base price
        rolePreferences: {
            BATSMAN: 1.0,
            BOWLER: 1.0,
            ALL_ROUNDER: 1.2,
            WICKET_KEEPER: 0.9,
        },
    };
}

function analyzeSquadNeeds(squad: { player: CricketPlayer }[]): Record<string, number> {
    const counts: Record<string, number> = {
        BATSMAN: 0, BOWLER: 0, ALL_ROUNDER: 0, WICKET_KEEPER: 0,
    };
    squad.forEach(s => { counts[s.player.role] = (counts[s.player.role] || 0) + 1; });

    // How much we need each role (higher = more needed)
    const needs: Record<string, number> = {
        BATSMAN: counts.BATSMAN < 4 ? 1.5 : counts.BATSMAN < 6 ? 1.0 : 0.5,
        BOWLER: counts.BOWLER < 4 ? 1.5 : counts.BOWLER < 6 ? 1.0 : 0.5,
        ALL_ROUNDER: counts.ALL_ROUNDER < 2 ? 1.4 : counts.ALL_ROUNDER < 4 ? 1.0 : 0.6,
        WICKET_KEEPER: counts.WICKET_KEEPER < 1 ? 2.0 : counts.WICKET_KEEPER < 2 ? 1.0 : 0.3,
    };
    return needs;
}

function evaluatePlayerValue(player: CricketPlayer, team: AuctionTeam, personality: BotPersonality): number {
    const needs = analyzeSquadNeeds(team.squad);
    const roleNeed = needs[player.role] || 1.0;
    const rolePreference = personality.rolePreferences[player.role] || 1.0;
    const skill = Math.max(player.battingSkill, player.bowlingSkill);

    // Value = skill-based multiplier * need * preference * aggression
    const skillFactor = skill / 70; // normalize around 70
    return skillFactor * roleNeed * rolePreference * personality.aggression;
}

function shouldBotBid(
    player: CricketPlayer,
    currentBid: number,
    team: AuctionTeam,
    personality: BotPersonality
): { shouldBid: boolean; bidAmount: number } {
    if (team.squad.length >= team.maxSquadSize) {
        return { shouldBid: false, bidAmount: 0 };
    }

    // Ensure bot has enough purse for min remaining slots
    const slotsRemaining = team.maxSquadSize - team.squad.length;
    const minReserve = Math.max(0, (slotsRemaining - 1) * 0.25); // Reserve 0.25Cr per remaining slot
    const availablePurse = team.purse - minReserve;

    if (availablePurse <= currentBid) {
        return { shouldBid: false, bidAmount: 0 };
    }

    const value = evaluatePlayerValue(player, team, personality);
    const maxBid = Math.min(
        player.basePrice * personality.maxOverpay * value,
        availablePurse
    );

    const bidAmount = Math.round((currentBid + BID_INCREMENT) * 100) / 100;

    if (bidAmount > maxBid) {
        return { shouldBid: false, bidAmount: 0 };
    }

    // Probability of bidding decreases as bid goes up relative to value
    const bidRatio = bidAmount / maxBid;
    const bidProbability = Math.max(0, (1 - bidRatio) * personality.aggression);

    // Random chance to bid
    const shouldBid = Math.random() < bidProbability;

    return { shouldBid, bidAmount };
}

// ======================================================
// Run Bot Bidding Loop
// ======================================================

export async function runBotBidding(roomCode: string): Promise<AuctionState | null> {
    let state = await getAuctionState(roomCode);
    if (!state || state.status !== 'bidding' || !state.currentPlayer) return state;

    const room = await getRoomState(roomCode);
    if (!room) return state;

    // Identify bot teams
    const botTeams = state.teams.filter(t => isBotUser(t.username));
    if (botTeams.length === 0) return state;

    // Shuffle bot teams for fairness
    const shuffled = [...botTeams].sort(() => Math.random() - 0.5);

    // Multiple rounds of bot bidding (bots can counter-bid each other)
    let biddingActive = true;
    let rounds = 0;
    const maxRounds = 8; // Prevent infinite loops

    while (biddingActive && rounds < maxRounds) {
        biddingActive = false;
        rounds++;

        for (const botTeam of shuffled) {
            // Re-read state as it may have changed
            state = await getAuctionState(roomCode);
            if (!state || state.status !== 'bidding' || !state.currentPlayer) return state;

            // Don't bid against yourself
            if (state.currentBidder?.userId === botTeam.userId) continue;

            // Get fresh team data
            const freshTeam = state.teams.find(t => t.userId === botTeam.userId);
            if (!freshTeam) continue;

            const personality = generatePersonality(freshTeam.teamName);
            const { shouldBid, bidAmount } = shouldBotBid(
                state.currentPlayer,
                state.currentBid,
                freshTeam,
                personality
            );

            if (shouldBid) {
                const result = await placeBid(
                    roomCode,
                    botTeam.userId,
                    botTeam.username,
                    botTeam.teamName,
                    bidAmount
                );
                if (result.success) {
                    biddingActive = true;
                    state = result.state;
                }
            }
        }
    }

    return state;
}

// ======================================================
// Bot Auto-Sell (when timer expires and no human action)
// ======================================================

export async function botAutoSellIfNeeded(roomCode: string): Promise<AuctionState | null> {
    const state = await getAuctionState(roomCode);
    if (!state || state.status !== 'bidding') return state;

    if (state.timerEnd && Date.now() > state.timerEnd) {
        return await sellCurrentPlayer(roomCode);
    }
    return state;
}

// ======================================================
// Bot Playing 11 Selection
// ======================================================

interface EnrichedPlayer {
    id: string;
    name: string;
    role: string;
    battingSkill: number;
    bowlingSkill: number;
    nationality?: string;
}

export function botSelectPlaying11(squad: EnrichedPlayer[]): {
    selectedIds: string[];
    battingOrder: string[];
    captainId: string;
    wkId: string;
    openingBowlerId: string;
} {
    if (squad.length <= 11) {
        const ids = squad.map(p => p.id);
        return {
            selectedIds: ids,
            battingOrder: ids,
            captainId: squad[0]?.id || '',
            wkId: squad.find(p => p.role === 'WICKET_KEEPER')?.id || squad[0]?.id || '',
            openingBowlerId: squad.find(p => p.role === 'BOWLER')?.id || squad[0]?.id || '',
        };
    }

    // Select best 11 with balanced composition
    const byRole: Record<string, EnrichedPlayer[]> = {
        BATSMAN: [], BOWLER: [], ALL_ROUNDER: [], WICKET_KEEPER: [],
    };
    squad.forEach(p => {
        if (byRole[p.role]) byRole[p.role].push(p);
    });

    // Sort each role by skill
    Object.values(byRole).forEach(arr =>
        arr.sort((a, b) => Math.max(b.battingSkill, b.bowlingSkill) - Math.max(a.battingSkill, a.bowlingSkill))
    );

    const selected: EnrichedPlayer[] = [];

    // Pick WK (1)
    const wk = byRole.WICKET_KEEPER.shift();
    if (wk) selected.push(wk);

    // Pick top batsmen (3-4)
    const batCount = Math.min(4, byRole.BATSMAN.length);
    selected.push(...byRole.BATSMAN.splice(0, batCount));

    // Pick all-rounders (2-3)
    const arCount = Math.min(3, byRole.ALL_ROUNDER.length);
    selected.push(...byRole.ALL_ROUNDER.splice(0, arCount));

    // Pick bowlers (3-4)
    const bowlCount = Math.min(4, byRole.BOWLER.length);
    selected.push(...byRole.BOWLER.splice(0, bowlCount));

    // Fill remaining spots from leftovers
    const remaining = [...byRole.BATSMAN, ...byRole.ALL_ROUNDER, ...byRole.BOWLER, ...byRole.WICKET_KEEPER];
    remaining.sort((a, b) => Math.max(b.battingSkill, b.bowlingSkill) - Math.max(a.battingSkill, a.bowlingSkill));

    while (selected.length < 11 && remaining.length > 0) {
        selected.push(remaining.shift()!);
    }

    // Batting order: WK first (if opener type), then batsmen, then all-rounders, then bowlers
    const battingOrder = [...selected].sort((a, b) => {
        const order: Record<string, number> = { WICKET_KEEPER: 1, BATSMAN: 2, ALL_ROUNDER: 3, BOWLER: 4 };
        const diff = (order[a.role] || 5) - (order[b.role] || 5);
        if (diff !== 0) return diff;
        return b.battingSkill - a.battingSkill;
    });

    // Captain = highest overall skill
    const captain = [...selected].sort((a, b) =>
        (b.battingSkill + b.bowlingSkill) - (a.battingSkill + a.bowlingSkill)
    )[0];

    // WK = best wicket keeper, or best batting if no WK
    const wicketKeeper = selected.find(p => p.role === 'WICKET_KEEPER') || selected[0];

    // Opening bowler = best bowler by bowling skill
    const openingBowler = [...selected]
        .filter(p => p.role === 'BOWLER' || p.role === 'ALL_ROUNDER')
        .sort((a, b) => b.bowlingSkill - a.bowlingSkill)[0] || selected[selected.length - 1];

    return {
        selectedIds: selected.map(p => p.id),
        battingOrder: battingOrder.map(p => p.id),
        captainId: captain?.id || '',
        wkId: wicketKeeper?.id || '',
        openingBowlerId: openingBowler?.id || '',
    };
}

// ======================================================
// Bot Match Decisions
// ======================================================

export function botChooseNextBatter(state: MatchState): string | null {
    const available = state.battingOrder.filter(
        (b: BatterState) => !b.isOut && b !== state.striker && b !== state.nonStriker
    );
    if (available.length === 0) return null;

    // Pick the batter with the best batting skill who isn't out
    const best = [...available].sort(
        (a: BatterState, b: BatterState) => b.player.battingSkill - a.player.battingSkill
    );

    // In death overs, prefer power hitters (higher batting skill)
    // In early overs, prefer technically sound batters
    return best[0].player.id;
}

export function botChooseNextBowler(state: MatchState): string | null {
    const available = state.bowlingOrder.filter(
        (b: BowlerState) => b.overs < 4 && b !== state.currentBowler
    );
    if (available.length === 0) return null;

    const phase = state.matchPhase;

    // In powerplay, prefer fast bowlers (high bowling skill)
    // In middle overs, prefer spinners
    // In death overs, prefer yorker specialists (high bowling skill)
    const sorted = [...available].sort(
        (a: BowlerState, b: BowlerState) => {
            // Prefer bowlers with better economy in the match
            const econA = a.overs > 0 ? a.economy : 0;
            const econB = b.overs > 0 ? b.economy : 0;

            // Weight: skill (60%) + match performance (40%)
            const scoreA = a.player.bowlingSkill * 0.6 - econA * 0.4;
            const scoreB = b.player.bowlingSkill * 0.6 - econB * 0.4;

            return scoreB - scoreA;
        }
    );

    return sorted[0].player.id;
}

// ======================================================
// Bot Toss Decision
// ======================================================

export function botTossDecision(pitchType: string): 'bat' | 'bowl' {
    // Bowling pitches → bowl first
    // Batting pitches → bat first
    // Balanced/Spinning → random with slight bat preference
    switch (pitchType) {
        case 'BOWLING': return 'bowl';
        case 'BATTING': return 'bat';
        case 'SPINNING': return Math.random() < 0.6 ? 'bowl' : 'bat';
        default: return Math.random() < 0.55 ? 'bat' : 'bowl';
    }
}
