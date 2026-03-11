import { AuctionState, AuctionTeam, placeBid, getAuctionState, sellCurrentPlayer, nextPlayer, BID_INCREMENT, saveAuctionState, handleRtm } from './auctionEngine';
import { CricketPlayer, IPL_PLAYERS } from '@/data/players';
import { getRoomState } from './roomManager';
import type { MatchState, BatterState, BowlerState } from './matchEngine';
import { getRetentionState, retainPlayer, confirmRetentions, getRetentionEligiblePool } from './retentionEngine';
import { analyzeSquadNeeds, canAddOverseas, playerFillScore, getSquadComposition, IPL_MAX_SQUAD, IPL_MIN_SQUAD, IPL_MAX_OVERSEAS } from './squadUtils';

// ======================================================
// Bot Detection
// ======================================================

const BOT_USERNAMES = [
    'Chennai Super Kings', 'Mumbai Indians', 'Royal Challengers Bengaluru', 'Kolkata Knight Riders',
    'Delhi Capitals', 'Sunrisers Hyderabad', 'Punjab Kings', 'Rajasthan Royals',
    'Lucknow Super Giants', 'Gujarat Titans',
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
    const comp = getSquadComposition(team.squad);

    // Hard blocks
    if (comp.total >= IPL_MAX_SQUAD) return { shouldBid: false, bidAmount: 0 };
    if (player.nationality === 'Overseas' && !canAddOverseas(team.squad)) return { shouldBid: false, bidAmount: 0 };

    // Keep enough purse for filling remaining mandatory slots
    const slotsNeeded = Math.max(0, IPL_MIN_SQUAD - comp.total);
    const avgSlotCost = 0.5; // Conservative average cost per remaining slot
    const minReserve = Math.max(0, (slotsNeeded - 1) * avgSlotCost);
    const availablePurse = team.purse - minReserve;

    if (availablePurse <= currentBid) return { shouldBid: false, bidAmount: 0 };

    // Calculate fill score — 0 means squad is full or no need
    const fillScore = playerFillScore(player, team.squad);
    if (fillScore === 0) return { shouldBid: false, bidAmount: 0 };

    const skill = Math.max(player.battingSkill, player.bowlingSkill);
    const maxBid = Math.min(
        player.basePrice * personality.maxOverpay * fillScore,
        availablePurse * 0.75 // Don't spend more than 75% of available purse on one player
    );

    // For low-skill players, cap the bid tightly to avoid overspending
    const skillCap = skill >= 85 ? maxBid : Math.min(maxBid, player.basePrice * 4);

    const bidAmount = Math.round((currentBid + BID_INCREMENT) * 100) / 100;
    if (bidAmount > skillCap) return { shouldBid: false, bidAmount: 0 };

    // Probability of bidding decreases as bid ratio to max climbs
    const bidRatio = bidAmount / Math.max(skillCap, bidAmount);
    const squadsNeedFactor = comp.total < IPL_MIN_SQUAD ? 1.3 : 1.0; // More aggressive when squad is thin
    const bidProbability = Math.max(0, (1 - bidRatio) * personality.aggression * squadsNeedFactor);

    return { shouldBid: Math.random() < bidProbability, bidAmount };
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
    const eligible = squad.slice(0, IPL_MAX_SQUAD); // Never exceed 25

    if (eligible.length <= 11) {
        const ids = eligible.map(p => p.id);
        return {
            selectedIds: ids,
            battingOrder: ids,
            captainId: eligible[0]?.id || '',
            wkId: eligible.find(p => p.role === 'WICKET_KEEPER')?.id || eligible[0]?.id || '',
            openingBowlerId: eligible.find(p => p.role === 'BOWLER')?.id || eligible[0]?.id || '',
        };
    }

    // Sort each role group by skill descending
    const byRole: Record<string, EnrichedPlayer[]> = {
        BATSMAN: [], BOWLER: [], ALL_ROUNDER: [], WICKET_KEEPER: [],
    };
    eligible.forEach(p => { if (byRole[p.role]) byRole[p.role].push(p); });
    Object.values(byRole).forEach(arr =>
        arr.sort((a, b) => Math.max(b.battingSkill, b.bowlingSkill) - Math.max(a.battingSkill, a.bowlingSkill))
    );

    const selected: EnrichedPlayer[] = [];

    // Mandatory picks for a balanced XI:
    // 1 WK, 4 BAT, 2 AR, 4 BOWL — adjust based on availability
    const wk = byRole.WICKET_KEEPER.shift();
    if (wk) selected.push(wk);

    // Pick top 4 batsmen
    selected.push(...byRole.BATSMAN.splice(0, 4));
    // Pick top 2 all-rounders
    selected.push(...byRole.ALL_ROUNDER.splice(0, 2));
    // Pick top 4 bowlers
    selected.push(...byRole.BOWLER.splice(0, 4));

    // Fill remainder from best available
    const remaining = [
        ...byRole.BATSMAN, ...byRole.ALL_ROUNDER,
        ...byRole.BOWLER, ...byRole.WICKET_KEEPER
    ].sort((a, b) => Math.max(b.battingSkill, b.bowlingSkill) - Math.max(a.battingSkill, a.bowlingSkill));

    while (selected.length < 11 && remaining.length > 0) {
        selected.push(remaining.shift()!);
    }

    // Batting order: impact players first then WK, pure batsmen, all-rounders, then bowlers
    const battingOrder = [...selected].sort((a, b) => {
        const orderWeight = (p: EnrichedPlayer) => {
            // Prioritise high batting skill players at top
            const batScore = p.battingSkill * 1.5;
            const roleBonus = p.role === 'WICKET_KEEPER' ? 10 : p.role === 'BATSMAN' ? 0 :
                p.role === 'ALL_ROUNDER' ? -10 : -30;
            return batScore + roleBonus;
        };
        return orderWeight(b) - orderWeight(a);
    });

    // Captain = highest overall skill (batting + bowling combined)
    const captain = [...selected].sort((a, b) =>
        (b.battingSkill + b.bowlingSkill) - (a.battingSkill + a.bowlingSkill)
    )[0];

    // WK = best wicket keeper, fallback to best batter
    const wicketKeeper = selected.find(p => p.role === 'WICKET_KEEPER')
        || [...selected].sort((a, b) => b.battingSkill - a.battingSkill)[0];

    // Opening bowler = best bowler by bowling skill
    const openingBowler = [...selected]
        .filter(p => p.role === 'BOWLER' || p.role === 'ALL_ROUNDER')
        .sort((a, b) => b.bowlingSkill - a.bowlingSkill)[0]
        || selected[selected.length - 1];

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

// ======================================================
// Bot Retention Phase Logic
// ======================================================

export async function runBotRetentions(roomCode: string): Promise<void> {
    const state = await getRetentionState(roomCode);
    if (!state) return;

    for (const team of state.teams) {
        if (!isBotUser(team.username) || team.confirmed) continue;

        const pool = getRetentionEligiblePool(team.teamName);
        if (!pool) continue;

        // Sort by skill descending
        const sorted = [...pool].sort((a, b) => {
            const skillA = Math.max(a?.battingSkill || 0, a?.bowlingSkill || 0);
            const skillB = Math.max(b?.battingSkill || 0, b?.bowlingSkill || 0);
            return skillB - skillA;
        });

        // Retention strategy:
        // 1. Always retain superstar players (skill > 90)
        // 2. Retain very good players (skill > 85) if they are uncapped (cheaper)
        // 3. Limit to max 4 total retentions to save money for auction

        for (const player of sorted) {
            if (!player) continue;
            const skill = Math.max(player.battingSkill || 0, player.bowlingSkill || 0);

            const isUncapped = player.capStatus === 'Uncapped';

            let shouldRetain = false;
            // Bot strategy: retain if skill is high enough
            if (skill >= 90) shouldRetain = true;
            else if (skill >= 86 && team.retained.length < 3) shouldRetain = true;
            else if (isUncapped && skill >= 80 && team.retained.length < 5) shouldRetain = true;

            // Enforce overseas limit
            if (shouldRetain && player.nationality === 'Overseas') {
                const overseasCount = team.retained.filter(r => r.nationality === 'Overseas').length;
                if (overseasCount >= 2) shouldRetain = false;
            }

            if (shouldRetain) {
                // await result of retainPlayer
                await retainPlayer(roomCode, team.userId, player.name);
            }
        }

        // Always confirm
        await confirmRetentions(roomCode, team.userId);
    }
}


// ======================================================
// Bot RTM Decision Logic
// ======================================================

export async function runBotRtmDecisions(roomCode: string): Promise<AuctionState | null> {
    const state = await getAuctionState(roomCode);
    if (!state || !state.rtmPending || !state.rtmOriginalTeamId || !state.currentPlayer) return state;

    const botTeam = state.teams.find(t => t.userId === state.rtmOriginalTeamId);
    if (!botTeam || !isBotUser(botTeam.username)) return state;

    // Evaluate if bot should use RTM
    const personality = generatePersonality(botTeam.teamName);
    const value = evaluatePlayerValue(state.currentPlayer, botTeam, personality);

    // RTM is "guaranteed" purchase, so we might be a bit more willing if it's a marquee player
    const maxRtmPrice = state.currentPlayer.basePrice * personality.maxOverpay * value * 1.1; // 10% premium for RTM

    const shouldRtm = state.currentBid <= maxRtmPrice && botTeam.purse >= state.currentBid;

    console.log(`[Bot RTM] ${botTeam.teamName} deciding on ${state.currentPlayer.name}. Bid: ${state.currentBid}, Max: ${maxRtmPrice.toFixed(2)}. Decision: ${shouldRtm}`);

    return await handleRtm(roomCode, shouldRtm);
}
