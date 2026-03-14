import redis from './redis';
import { getStadiumById } from '@/data/stadiums';
import { CricketPlayer } from '@/data/players';

export interface MatchState {
    matchId: string;
    roomCode: string;
    homeTeam: MatchTeam;
    awayTeam: MatchTeam;
    innings: number;
    status: 'scheduled' | 'toss' | 'toss_decision' | 'awaiting_selection' | 'live' | 'innings_break' | 'awaiting_batter' | 'awaiting_bowler' | 'completed';
    currentBatting: 'home' | 'away';
    pitchType: 'BATTING' | 'BOWLING' | 'BALANCED' | 'SPINNING';
    target: number | null;
    currentOver: number;
    currentBall: number;
    battingOrder: BatterState[];
    bowlingOrder: BowlerState[];
    striker: BatterState | null;
    nonStriker: BatterState | null;
    currentBowler: BowlerState | null;
    commentary: string[];
    result: string | null;
    matchPhase: 'powerplay' | 'middle' | 'death';
    freeHit: boolean;
    runsRequired?: number;
    ballsRemaining?: number;
    requiredRunRate?: number;
    // Toss fields
    toss?: TossResult;
    // Captain / WK / roles
    homeCaptainId?: string;
    awayCaptainId?: string;
    homeWkId?: string;
    awayWkId?: string;
    homeOpeningBowlerId?: string;
    awayOpeningBowlerId?: string;
    // History
    firstInningsBattingOrder?: BatterState[];
    firstInningsBowlingOrder?: BowlerState[];
    stadiumId?: string;
    homeLocked?: boolean;
    awayLocked?: boolean;
    lastBowlerId?: string | null;
    homeBattingOrder?: string[];
    awayBattingOrder?: string[];
}

export interface TossResult {
    winnerId: string;
    winnerName: string;
    loserId: string;
    loserName: string;
    decision: 'bat' | 'bowl' | null; // null = not yet decided
}

export interface MatchTeam {
    teamId: string;
    name: string;
    userId: string;
    score: number;
    wickets: number;
    overs: number;
    balls: number;
    extras: number;
    extrasBreakdown: {
        wides: number;
        noBalls: number;
        byes: number;
        legByes: number;
        penalty: number;
    };
    fow: {
        wickets: number;
        score: number;
        over: number;
        ball: number;
        batterName: string;
    }[];
    runRate: number;
    players: MatchPlayer[];
}

export interface MatchPlayer {
    id: string;
    name: string;
    role: string;
    battingSkill: number;
    bowlingSkill: number;
    isCaptain?: boolean;
    isWicketKeeper?: boolean;
}

export interface BatterState {
    player: MatchPlayer;
    runs: number;
    balls: number;
    fours: number;
    sixes: number;
    isOut: boolean;
    dismissal: string;
    strikeRate: number;
}

export interface BowlerState {
    player: MatchPlayer;
    overs: number;
    balls: number;
    maidens: number;
    runs: number;
    wickets: number;
    economy: number;
    dots: number;
    overBalls: number;
    runsInOver: number;
}

export interface BallResult {
    runs: number;
    isWicket: boolean;
    isBoundary: boolean;
    isSix: boolean;
    isExtra: boolean;
    extraType: string | null;
    extraRuns: number;
    dismissalType: string | null;
    commentary: string;
}

const TOTAL_OVERS = 20;
const MAX_WICKETS = 10;

function getMatchPhase(overs: number): 'powerplay' | 'middle' | 'death' {
    if (overs < 6) return 'powerplay';
    if (overs < 15) return 'middle';
    return 'death';
}

function getPitchModifier(pitchType: string, phase: string): { batMod: number; bowlMod: number } {
    const mods: Record<string, Record<string, { batMod: number; bowlMod: number }>> = {
        BATTING: { powerplay: { batMod: 1.2, bowlMod: 0.8 }, middle: { batMod: 1.15, bowlMod: 0.85 }, death: { batMod: 1.1, bowlMod: 0.9 } },
        BOWLING: { powerplay: { batMod: 0.9, bowlMod: 1.15 }, middle: { batMod: 0.85, bowlMod: 1.2 }, death: { batMod: 0.95, bowlMod: 1.1 } },
        BALANCED: { powerplay: { batMod: 1.05, bowlMod: 1.0 }, middle: { batMod: 1.0, bowlMod: 1.0 }, death: { batMod: 1.05, bowlMod: 0.95 } },
        SPINNING: { powerplay: { batMod: 1.0, bowlMod: 1.0 }, middle: { batMod: 0.85, bowlMod: 1.2 }, death: { batMod: 0.9, bowlMod: 1.1 } },
    };
    return mods[pitchType]?.[phase] || { batMod: 1.0, bowlMod: 1.0 };
}

export function isSpinner(player: MatchPlayer): boolean {
    const spinnerNames = [
        'khan', 'yadav', 'chakaravarthy', 'narine', 'bisnoi', 'ashwin', 'jadeja', 
        'hasaranga', 'theekshana', 'noor', 'gopal', 'chahar', 'hosein', 'sundar', 
        'tewatia', 'kishore', 'chakravarthy', 'bishnoi', 'markande', 'ghazanfar', 
        'mandal', 'santner', 'axar', 'kuldeep', 'rashid', 'sharma', 'krunal', 'swapnil'
    ];
    const name = player.name.toLowerCase();
    return spinnerNames.some(s => name.includes(s)) && player.role !== 'BATSMAN';
}

function simulateBall(
    batter: BatterState,
    bowler: BowlerState,
    pitchType: string,
    phase: string,
    freeHit: boolean,
    target: number | null,
    currentScore: number,
    ballsRemaining: number,
    stadiumId?: string,
    innings?: number
): BallResult {
    const stadium = stadiumId ? getStadiumById(stadiumId) : null;
    const { batMod, bowlMod } = getPitchModifier(pitchType, phase);

    let batSkill = batter.player.battingSkill * batMod;
    let bowlSkill = bowler.player.bowlingSkill * bowlMod;

    // Apply Stadium Factors
    if (stadium) {
        // Altitude boost for batters
        batSkill *= stadium.altitudeFactor;

        // Bounce & Turn Factors
        const spinner = isSpinner(bowler.player);
        
        // Bounce impact
        if (stadium.bounce >= 4) {
            if (!spinner) bowlSkill *= (1 + (stadium.bounce - 3) * 0.05); // Boost pacers on bouncy tracks
        } else if (stadium.bounce <= 2) {
            if (spinner) bowlSkill *= (1 + (3 - stadium.bounce) * 0.05); // Boost spinners on low bounce
        }

        // Turn impact
        if (stadium.turn >= 4 && spinner) {
            bowlSkill *= (1 + (stadium.turn - 3) * 0.08); // Significant boost for spinners on turning tracks
        }

        // Dew factor (affects 2nd innings bowlers, especially spinners)
        if (innings === 2 && Math.random() < stadium.dewProbability) {
            const dewImpact = spinner ? 0.82 : 0.90; // Spinners struggle more with wet ball
            bowlSkill *= dewImpact;
        }
    }

    // Captain boost
    const isCaptain = batter.player.isCaptain;
    const isBowlerCaptain = bowler.player.isCaptain;
    if (isCaptain) batSkill += 3;
    if (isBowlerCaptain) bowlSkill += 2;

    // Form factor (random variance)
    const form = 0.85 + Math.random() * 0.3;
    const effectiveBat = batSkill * form;
    const effectiveBowl = bowlSkill * (0.85 + Math.random() * 0.3);

    // Pressure factor for chasing & Par scores
    let pressureFactor = 1.0;
    const currentBalls = (20 * 6) - ballsRemaining;
    const parScore = (innings === 2 ? stadium?.avg2ndInnings : stadium?.avg1stInnings) || 160;
    
    if (target !== null && ballsRemaining > 0) {
        const requiredRate = ((target - currentScore) / ballsRemaining) * 6;
        if (requiredRate > 12) pressureFactor = 0.82;
        else if (requiredRate > 9) pressureFactor = 0.90;
        else if (requiredRate < 4) pressureFactor = 1.15;
    } else if (stadium && currentBalls > 30) {
        // Even in 1st innings, compare to par after 5 overs
        const projectedScore = (currentScore / currentBalls) * 120;
        if (projectedScore < parScore * 0.8) pressureFactor = 0.92; // Take more risks if way below par
    }

    // Extra chance (wide/no-ball) ~5%
    const extraRoll = Math.random();
    if (extraRoll < 0.03) {
        return {
            runs: 0, isWicket: false, isBoundary: false, isSix: false,
            isExtra: true, extraType: 'wide', extraRuns: 1, dismissalType: null,
            commentary: `Wide ball! One extra run.`,
        };
    }
    if (extraRoll < 0.05) {
        // No ball: simulation continues to see if batter scored runs
        const runProbs = getRunProbabilities(effectiveBat, effectiveBowl, phase, pressureFactor, stadium?.boundarySize, stadium?.batFriendly);
        const runRoll = Math.random();
        let cumulative = 0;
        let runs = 0;
        for (const [outcome, prob] of runProbs) {
            cumulative += prob;
            if (runRoll < cumulative) { runs = outcome; break; }
        }
        return {
            runs, isWicket: false, isBoundary: runs === 4, isSix: runs === 6,
            isExtra: true, extraType: 'no_ball', extraRuns: 1, dismissalType: null,
            commentary: `No ball! ${runs > 0 ? `${runs} runs off the bat!` : ''} Free hit coming up.`,
        };
    }

    // Wicket probability
    const baseWicketProb = 0.04;
    const wicketProb = baseWicketProb * (effectiveBowl / effectiveBat) * (1 / pressureFactor);

    if (!freeHit && Math.random() < Math.min(wicketProb, 0.15)) {
        const dismissals = ['bowled', 'caught', 'lbw', 'caught behind', 'run out', 'stumped'];
        let weights = bowler.player.role === 'BOWLER' ? [25, 35, 20, 10, 5, 5] : [20, 35, 15, 15, 10, 5];

        // Apply Stadium-Influenced Dismissal Weights
        if (stadium) {
            if (stadium.bounce >= 4) {
                // More caught/caught behinds on bouncy tracks
                weights[1] += 10; // caught
                weights[3] += 5;  // caught behind
            } else if (stadium.bounce <= 2) {
                // More bowled/lbw on low bounce
                weights[0] += 10; // bowled
                weights[2] += 10; // lbw
            }
            if (stadium.turn >= 4) {
                // More stumped chances on turning tracks
                weights[5] += 10; // stumped
            }
        }

        const total = weights.reduce((a, b) => a + b, 0);
        let rand = Math.random() * total;
        let dismissalType = 'caught';
        for (let i = 0; i < dismissals.length; i++) {
            rand -= weights[i];
            if (rand <= 0) { dismissalType = dismissals[i]; break; }
        }

        return {
            runs: 0, isWicket: true, isBoundary: false, isSix: false,
            isExtra: false, extraType: null, extraRuns: 0, dismissalType,
            commentary: `OUT! ${batter.player.name} ${dismissalType} by ${bowler.player.name}!`,
        };
    }

    // Runs distribution based on skill
    const runProbs = getRunProbabilities(effectiveBat, effectiveBowl, phase, pressureFactor, stadium?.boundarySize, stadium?.batFriendly);
    const runRoll = Math.random();
    let cumulative = 0;
    let runs = 0;

    for (const [outcome, prob] of runProbs) {
        cumulative += prob;
        if (runRoll < cumulative) { runs = outcome; break; }
    }

    const isBoundary = runs === 4;
    const isSix = runs === 6;

    const commentaries: Record<number, string[]> = {
        0: [`Dot ball! ${bowler.player.name} keeps it tight.`, `No run. Good delivery.`, `Defended solidly by ${batter.player.name}.`],
        1: [`Single taken by ${batter.player.name}.`, `Quick single, good running.`, `Pushed for one.`],
        2: [`Two runs! Good placement by ${batter.player.name}.`, `They come back for two.`],
        3: [`Three runs! Excellent running between the wickets.`],
        4: [`FOUR! ${batter.player.name} sends it to the boundary!`, `Boundary! Beautiful shot!`, `FOUR! Crashing through the covers!`],
        6: [`SIX! ${batter.player.name} launches it into the crowd!`, `MAXIMUM! What a hit!`, `SIX! That's gone all the way!`],
    };

    const options = commentaries[runs] || [`${runs} runs.`];
    let commentary = options[Math.floor(Math.random() * options.length)];

    // Small chance of Byes / Leg-Byes on dot balls (runs === 0)
    let extraType = null;
    let extraRuns = 0;
    if (runs === 0 && Math.random() < 0.03) {
        const isBye = Math.random() < 0.5;
        extraType = isBye ? 'bye' : 'leg_bye';
        extraRuns = Math.random() < 0.1 ? 4 : 1; // 10% chance of 4 byes (passed keeper)
        const isBoundaryExtra = extraRuns === 4;
        commentary = `${extraType === 'bye' ? 'Byes' : 'Leg byes'}! The batters ${isBoundaryExtra ? 'get a boundary' : 'sneak a run'}.`;
        return {
            runs, isWicket: false, isBoundary: isBoundaryExtra, isSix: false,
            isExtra: false, extraType, extraRuns, dismissalType: null,
            commentary,
        };
    }

    return {
        runs, isWicket: false, isBoundary, isSix,
        isExtra: false, extraType, extraRuns, dismissalType: null,
        commentary,
    };
}

function getRunProbabilities(
    batSkill: number,
    bowlSkill: number,
    phase: string,
    pressureFactor: number,
    boundarySize: number = 1.0,
    batFriendly: number = 3
): [number, number][] {
    const skillRatio = batSkill / (batSkill + bowlSkill);
    const boundaryMod = 1 / (boundarySize * 0.9 + 0.1); // Stronger impact for smaller grounds
    const friendlyMod = 0.85 + (batFriendly / 5) * 0.3; // 0.91 to 1.15 multiplier

    // Base probabilities [runs, probability]
    let probs: [number, number][];

    if (phase === 'powerplay') {
        probs = [
            [0, 0.30 - skillRatio * 0.1],
            [1, 0.30 * friendlyMod],
            [2, 0.12 * friendlyMod],
            [3, 0.03 * friendlyMod],
            [4, (0.15 + skillRatio * 0.05) * boundaryMod * friendlyMod],
            [6, (0.10 + skillRatio * 0.05) * boundaryMod * friendlyMod],
        ];
    } else if (phase === 'death') {
        probs = [
            [0, 0.25 - skillRatio * 0.08],
            [1, 0.25 * friendlyMod],
            [2, 0.12 * friendlyMod],
            [3, 0.03 * friendlyMod],
            [4, (0.18 + skillRatio * 0.05) * boundaryMod * friendlyMod],
            [6, (0.17 + skillRatio * 0.08) * boundaryMod * friendlyMod],
        ];
    } else {
        probs = [
            [0, 0.35 - skillRatio * 0.08],
            [1, 0.30 * friendlyMod],
            [2, 0.12 * friendlyMod],
            [3, 0.03 * friendlyMod],
            [4, (0.12 + skillRatio * 0.05) * boundaryMod * friendlyMod],
            [6, (0.08 + skillRatio * 0.03) * boundaryMod * friendlyMod],
        ];
    }

    // Apply pressure factor
    if (pressureFactor < 1.0) {
        probs = probs.map(([r, p]) => {
            if (r === 0) return [r, p * 1.2] as [number, number];
            if (r >= 4) return [r, p * pressureFactor] as [number, number];
            return [r, p] as [number, number];
        });
    }

    // Normalize
    const total = probs.reduce((sum, [, p]) => sum + p, 0);
    return probs.map(([r, p]) => [r, p / total] as [number, number]);
}

// ======================================================
// Toss
// ======================================================

export function performToss(homeTeam: MatchTeam, awayTeam: MatchTeam): TossResult {
    const coinFlip = Math.random() < 0.5;
    const winner = coinFlip ? homeTeam : awayTeam;
    const loser = coinFlip ? awayTeam : homeTeam;

    return {
        winnerId: winner.userId,
        winnerName: winner.name,
        loserId: loser.userId,
        loserName: loser.name,
        decision: null, // to be filled by the toss winner
    };
}

// ======================================================
// Match Initialization
// ======================================================

export function initMatchState(
    matchId: string,
    roomCode: string,
    homeTeam: MatchTeam,
    awayTeam: MatchTeam,
    pitchType: MatchState['pitchType'] = 'BALANCED',
    options?: {
        tossResult?: TossResult;
        homeBattingOrder?: string[];
        awayBattingOrder?: string[];
        homeCaptainId?: string;
        awayCaptainId?: string;
        homeWkId?: string;
        awayWkId?: string;
        homeOpeningBowlerId?: string;
        awayOpeningBowlerId?: string;
        stadiumId?: string;
    }
): MatchState {
    // Apply captain and WK flags
    if (options?.homeCaptainId) {
        homeTeam.players.forEach(p => { p.isCaptain = p.id === options.homeCaptainId; });
    }
    if (options?.awayCaptainId) {
        awayTeam.players.forEach(p => { p.isCaptain = p.id === options.awayCaptainId; });
    }
    if (options?.homeWkId) {
        homeTeam.players.forEach(p => { p.isWicketKeeper = p.id === options.homeWkId; });
    }
    if (options?.awayWkId) {
        awayTeam.players.forEach(p => { p.isWicketKeeper = p.id === options.awayWkId; });
    }

    // Determine who bats first based on toss
    let battingFirst: 'home' | 'away' = 'home';
    if (options?.tossResult?.decision) {
        const tossWinnerIsHome = options.tossResult.winnerId === homeTeam.userId;
        if (options.tossResult.decision === 'bat') {
            battingFirst = tossWinnerIsHome ? 'home' : 'away';
        } else {
            battingFirst = tossWinnerIsHome ? 'away' : 'home';
        }
    }

    const firstBattingTeam = battingFirst === 'home' ? homeTeam : awayTeam;
    const firstBowlingTeam = battingFirst === 'home' ? awayTeam : homeTeam;

    // Apply batting order if provided
    const battingOrderIds = battingFirst === 'home' ? options?.homeBattingOrder : options?.awayBattingOrder;
    let orderedBattingPlayers = firstBattingTeam.players;
    if (battingOrderIds && battingOrderIds.length > 0) {
        orderedBattingPlayers = battingOrderIds
            .map(id => firstBattingTeam.players.find(p => p.id === id))
            .filter(Boolean) as MatchPlayer[];
        // Add any players not in the order at the end
        const remaining = firstBattingTeam.players.filter(p => !battingOrderIds.includes(p.id));
        orderedBattingPlayers = [...orderedBattingPlayers, ...remaining];
    }

    const battingOrder = orderedBattingPlayers.map(p => ({
        player: p,
        runs: 0, balls: 0, fours: 0, sixes: 0,
        isOut: false, dismissal: '', strikeRate: 0,
    }));

    // Determine opening bowler
    const openingBowlerId = battingFirst === 'home' ? options?.awayOpeningBowlerId : options?.homeOpeningBowlerId;

    let bowlingOrder = firstBowlingTeam.players
        .filter(p => p.role !== 'BATSMAN' && p.role !== 'WICKET_KEEPER')
        .concat(firstBowlingTeam.players.filter(p => p.role === 'BATSMAN' || p.role === 'WICKET_KEEPER'))
        .slice(0, 11) // Take more to ensure we don't miss the selected opening bowler
        .map(p => ({
            player: p,
            overs: 0, balls: 0, maidens: 0, runs: 0,
            wickets: 0, economy: 0, dots: 0, overBalls: 0, runsInOver: 0,
        }));

    // If opening bowler is specified, move them to the front of the list
    if (openingBowlerId) {
        const index = bowlingOrder.findIndex(b => b.player.id === openingBowlerId);
        if (index > -1) {
            const [opener] = bowlingOrder.splice(index, 1);
            bowlingOrder.unshift(opener);
        } else {
            // If not found in the "bowlers" list, look in the whole squad
            const p = firstBowlingTeam.players.find(p => p.id === openingBowlerId);
            if (p) {
                bowlingOrder.unshift({
                    player: p,
                    overs: 0, balls: 0, maidens: 0, runs: 0,
                    wickets: 0, economy: 0, dots: 0, overBalls: 0, runsInOver: 0,
                });
            }
        }
    }

    const currentBowler = bowlingOrder[0] || null;

    return {
        matchId, roomCode,
        homeTeam: { ...homeTeam, score: 0, wickets: 0, overs: 0, balls: 0, extras: 0, extrasBreakdown: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0 }, fow: [], runRate: 0 },
        awayTeam: { ...awayTeam, score: 0, wickets: 0, overs: 0, balls: 0, extras: 0, extrasBreakdown: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0 }, fow: [], runRate: 0 },
        innings: 1,
        status: 'awaiting_selection',
        currentBatting: battingFirst,
        pitchType,
        target: null,
        currentOver: 0, currentBall: 0,
        battingOrder,
        bowlingOrder,
        striker: battingOrder[0] || null,
        nonStriker: battingOrder[1] || null,
        currentBowler,
        commentary: ['Match started! First innings underway.'],
        result: null,
        matchPhase: 'powerplay',
        freeHit: false,
        runsRequired: 0,
        ballsRemaining: TOTAL_OVERS * 6,
        requiredRunRate: 0,
        toss: options?.tossResult || undefined,
        homeCaptainId: options?.homeCaptainId,
        awayCaptainId: options?.awayCaptainId,
        homeWkId: options?.homeWkId,
        awayWkId: options?.awayWkId,
        firstInningsBattingOrder: [],
        firstInningsBowlingOrder: [],
        stadiumId: options?.stadiumId,
        homeLocked: false,
        awayLocked: false,
        homeBattingOrder: options?.homeBattingOrder,
        awayBattingOrder: options?.awayBattingOrder,
    };
}

// ======================================================
// Process Next Ball
// ======================================================

export function processNextBall(state: MatchState): { state: MatchState; ballResult: BallResult } {
    if (state.status === 'completed') {
        return { state, ballResult: { runs: 0, isWicket: false, isBoundary: false, isSix: false, isExtra: false, extraType: null, extraRuns: 0, dismissalType: null, commentary: 'Match already completed.' } };
    }

    if (state.status === 'awaiting_batter' || state.status === 'awaiting_bowler') {
        return { state, ballResult: { runs: 0, isWicket: false, isBoundary: false, isSix: false, isExtra: false, extraType: null, extraRuns: 0, dismissalType: null, commentary: `Waiting for ${state.status === 'awaiting_batter' ? 'new batter' : 'bowler'} selection.` } };
    }

    const battingTeam = state.currentBatting === 'home' ? state.homeTeam : state.awayTeam;

    if (!state.striker || !state.currentBowler) {
        return { state, ballResult: { runs: 0, isWicket: false, isBoundary: false, isSix: false, isExtra: false, extraType: null, extraRuns: 0, dismissalType: null, commentary: 'Error: No striker or bowler.' } };
    }

    state.matchPhase = getMatchPhase(battingTeam.overs);

    const ballResult = simulateBall(
        state.striker, state.currentBowler, state.pitchType, state.matchPhase,
        state.freeHit, state.target, battingTeam.score,
        (TOTAL_OVERS * 6) - (battingTeam.overs * 6 + battingTeam.balls),
        state.stadiumId, state.innings
    );

    // Process result
    if (ballResult.extraType === 'no_ball') {
        state.freeHit = true;
    } else if (!ballResult.isExtra) {
        state.freeHit = false;
    }
    // Wide balls don't change the free-hit status

    if (ballResult.isExtra) {
        const teamRuns = ballResult.runs + ballResult.extraRuns;
        battingTeam.score += teamRuns;
        battingTeam.extras += ballResult.extraRuns;
        
        if (ballResult.extraType === 'wide') {
            battingTeam.extrasBreakdown.wides += ballResult.extraRuns;
        } else if (ballResult.extraType === 'no_ball') {
            battingTeam.extrasBreakdown.noBalls += ballResult.extraRuns;
            state.striker.runs += ballResult.runs;
            state.striker.balls++; // No-ball counts as ball faced
            if (ballResult.isBoundary) state.striker.fours++;
            if (ballResult.isSix) state.striker.sixes++;
        } else if (ballResult.extraType === 'bye') {
            battingTeam.extrasBreakdown.byes += ballResult.extraRuns;
        } else if (ballResult.extraType === 'leg_bye') {
            battingTeam.extrasBreakdown.legByes += ballResult.extraRuns;
        }

        if (ballResult.extraType === 'wide' || ballResult.extraType === 'no_ball') {
            state.currentBowler.runs += teamRuns;
            state.currentBowler.runsInOver += teamRuns;
        }

        if (ballResult.runs % 2 === 1) {
            const temp = state.striker;
            state.striker = state.nonStriker;
            state.nonStriker = temp;
        }
        // Don't count as a legal delivery
    } else {
        // Legal delivery
        battingTeam.balls++;
        state.currentBall++;
        state.striker.balls++;
        if (state.currentBowler) {
            state.currentBowler.balls++;
            state.currentBowler.overBalls++;
            if (ballResult.runs === 0 && !ballResult.isWicket) {
                state.currentBowler.dots++;
            }
        }

        if (ballResult.isWicket) {
            state.striker.isOut = true;
            state.striker.dismissal = ballResult.dismissalType || 'out';
            battingTeam.wickets++;
            state.currentBowler.wickets++;

            // Record Fall of Wicket
            battingTeam.fow.push({
                wickets: battingTeam.wickets,
                score: battingTeam.score,
                over: battingTeam.overs,
                ball: battingTeam.balls,
                batterName: state.striker.player.name
            });

            // Check if innings is over due to all out
            if (battingTeam.wickets >= MAX_WICKETS) {
                // Don't need next batter, innings is over
                state.striker = null;
            } else {
                // Set status to awaiting_batter — user must choose the next batter
                state.status = 'awaiting_batter';
                state.striker = null;
            }
        } else {
            const teamRuns = ballResult.runs + ballResult.extraRuns;
            battingTeam.score += teamRuns;
            state.striker.runs += ballResult.runs;
            
            // Byes/Leg-byes are extras on a legal ball
            if (ballResult.extraType === 'bye') {
                battingTeam.extras += ballResult.extraRuns;
                battingTeam.extrasBreakdown.byes += ballResult.extraRuns;
            } else if (ballResult.extraType === 'leg_bye') {
                battingTeam.extras += ballResult.extraRuns;
                battingTeam.extrasBreakdown.legByes += ballResult.extraRuns;
            }

            // Only runs off the bat count against the bowler on a legal ball
            state.currentBowler.runs += ballResult.runs;
            state.currentBowler.runsInOver += ballResult.runs;

            if (ballResult.isBoundary) state.striker.fours++;
            if (ballResult.isSix) state.striker.sixes++;

            // Rotate strike on odd TOTAL runs (including byes) - but NOT on boundaries
            if (teamRuns % 2 === 1 && !ballResult.isBoundary) {
                const temp = state.striker;
                state.striker = state.nonStriker;
                state.nonStriker = temp;
            }
        }

        // Check over completion
        if (state.currentBowler.overBalls >= 6) {
            if (state.currentBowler.runsInOver === 0) {
                state.currentBowler.maidens++;
            }
            state.currentBowler.overs++;
            state.currentBowler.overBalls = 0;
            state.currentBowler.runsInOver = 0;

            battingTeam.overs++;
            battingTeam.balls = 0;
            state.currentBall = 0;
            state.currentOver++;

            // Rotate strike at end of over
            // In cricket, both batters swap ends. This works even if one is null (awaiting new batter).
            const temp = state.striker;
            state.striker = state.nonStriker;
            state.nonStriker = temp;

            // Always clear current bowler at the end of the over
            state.lastBowlerId = state.currentBowler?.player.id;
            state.currentBowler = null;

            // Set status to awaiting_bowler — user must choose the next bowler
            // But only if the innings isn't about to end
            if (battingTeam.overs < TOTAL_OVERS && battingTeam.wickets < MAX_WICKETS) {
                if (state.status !== 'awaiting_batter') {
                    state.status = 'awaiting_bowler';
                }
            }
        }
    }

    // Update strike rates for all batters in this innings
    state.battingOrder.forEach(b => {
        if (b.balls > 0) {
            b.strikeRate = Math.round((b.runs / b.balls) * 100 * 100) / 100;
        } else {
            b.strikeRate = 0;
        }
    });

    // Update economies for all bowlers in this innings
    state.bowlingOrder.forEach(bowler => {
        const bBalls = bowler.overs * 6 + bowler.overBalls;
        if (bBalls > 0) {
            bowler.economy = Math.round((bowler.runs / bBalls) * 6 * 100) / 100;
        } else {
            bowler.economy = 0;
        }
    });

    const totalBalls = battingTeam.overs * 6 + battingTeam.balls;
    battingTeam.runRate = totalBalls > 0 ? Math.round((battingTeam.score / totalBalls) * 6 * 100) / 100 : 0;

    // Update chase info for 2nd innings
    if (state.innings === 2 && state.target !== null) {
        state.runsRequired = Math.max(0, state.target - battingTeam.score);
        state.ballsRemaining = (TOTAL_OVERS * 6) - totalBalls;
        state.requiredRunRate = state.ballsRemaining > 0 ? Math.round((state.runsRequired / state.ballsRemaining) * 6 * 100) / 100 : 0;
    }

    // Add commentary
    state.commentary.unshift(ballResult.commentary);
    if (state.commentary.length > 50) state.commentary = state.commentary.slice(0, 50);

    // Check innings/match end
    if (state.innings === 2 && state.target !== null && battingTeam.score >= state.target) {
        state.status = 'completed';
        const battingName = state.currentBatting === 'home' ? state.homeTeam.name : state.awayTeam.name;
        const wicketsLeft = MAX_WICKETS - battingTeam.wickets;
        state.result = `${battingName} won by ${wicketsLeft} wickets!`;
        state.commentary.unshift(`🏆 ${state.result}`);
    } else if (battingTeam.wickets >= MAX_WICKETS || battingTeam.overs >= TOTAL_OVERS) {
        if (state.innings === 1) {
            // Switch innings
            state.target = battingTeam.score + 1;
            state.innings = 2;
            state.status = 'innings_break';

            const inningsBreakComm = `End of first innings! ${battingTeam.name}: ${battingTeam.score}/${battingTeam.wickets} (${battingTeam.overs}.${battingTeam.balls}). Target: ${state.target}`;
            state.commentary.unshift(inningsBreakComm);

            // Setup second innings
            setupSecondInnings(state);
        } else {
            state.status = 'completed';
            const battingTeam = state.currentBatting === 'home' ? state.homeTeam : state.awayTeam;
            const bowlingTeam = state.currentBatting === 'home' ? state.awayTeam : state.homeTeam;

            if (bowlingTeam.score > battingTeam.score) {
                // Bowling team (batting first) won
                state.result = `${bowlingTeam.name} won by ${bowlingTeam.score - battingTeam.score} runs!`;
            } else if (battingTeam.score > bowlingTeam.score) {
                // Batting team (batting second) won - though this should be caught by the previous block
                const wicketsLeft = MAX_WICKETS - battingTeam.wickets;
                state.result = `${battingTeam.name} won by ${wicketsLeft} wickets!`;
            } else {
                state.result = 'Match tied!';
            }
            state.commentary.unshift(`🏆 ${state.result}`);
        }
    }

    return { state, ballResult };
}

// ======================================================
// Select Next Batter / Bowler (Interactive)
// ======================================================

export function selectNextBatter(state: MatchState, batterId: string): MatchState {
    if (state.status !== 'awaiting_batter') return state;

    const batterIdx = state.battingOrder.findIndex(b => b.player.id === batterId && !b.isOut && b !== state.striker && b !== state.nonStriker);
    if (batterIdx === -1) return state;

    const batter = state.battingOrder[batterIdx];

    // Re-order battingOrder to be chronological
    // Find the first index that is neither out nor currently batting
    let targetIdx = state.battingOrder.findIndex(b => !b.isOut && b !== state.striker && b !== state.nonStriker);
    if (targetIdx !== -1 && targetIdx !== batterIdx) {
        const [removed] = state.battingOrder.splice(batterIdx, 1);
        state.battingOrder.splice(targetIdx, 0, removed);
    }

    if (!state.striker) {
        state.striker = batter;
    } else {
        state.nonStriker = batter;
    }
    state.status = 'live';

    // If bowler was also pending (wicket fell on last ball of over), mark accordingly
    if (!state.currentBowler) {
        state.status = 'awaiting_bowler';
    }

    state.commentary.unshift(`${batter.player.name} walks to the crease.`);
    return state;
}

export function selectNextBowler(state: MatchState, bowlerId: string): MatchState {
    if (state.status !== 'awaiting_bowler') return state;

    if (bowlerId === state.lastBowlerId) {
        // A bowler cannot bowl consecutive overs
        return state;
    }

    const bowler = state.bowlingOrder.find(b => b.player.id === bowlerId && b.overs < 4);
    if (!bowler) return state;

    state.currentBowler = bowler;
    state.status = 'live';
    state.commentary.unshift(`${bowler.player.name} to bowl.`);
    return state;
}

// ======================================================
// Setup Second Innings
// ======================================================

function setupSecondInnings(state: MatchState): void {
    // Save first innings stats
    state.firstInningsBattingOrder = [...state.battingOrder];
    state.firstInningsBowlingOrder = [...state.bowlingOrder];

    state.currentBatting = state.currentBatting === 'home' ? 'away' : 'home';
    const newBattingTeam = state.currentBatting === 'home' ? state.homeTeam : state.awayTeam;
    const newBowlingTeam = state.currentBatting === 'home' ? state.awayTeam : state.homeTeam;

    const battingOrderIds = state.currentBatting === 'home' ? state.homeBattingOrder : state.awayBattingOrder;
    let orderedBattingPlayers = newBattingTeam.players;
    if (battingOrderIds && battingOrderIds.length > 0) {
        orderedBattingPlayers = battingOrderIds
            .map(id => newBattingTeam.players.find(p => p.id === id))
            .filter(Boolean) as MatchPlayer[];
        const remaining = newBattingTeam.players.filter(p => !battingOrderIds.includes(p.id));
        orderedBattingPlayers = [...orderedBattingPlayers, ...remaining];
    }

    state.battingOrder = orderedBattingPlayers.map(p => ({
        player: p,
        runs: 0, balls: 0, fours: 0, sixes: 0,
        isOut: false, dismissal: '', strikeRate: 0,
    }));

    state.bowlingOrder = [...newBowlingTeam.players]
        .sort((a, b) => {
            const getPriority = (role: string) => {
                if (role === 'BOWLER') return 0;
                if (role === 'ALL_ROUNDER') return 1;
                return 2;
            };
            return getPriority(a.role) - getPriority(b.role);
        })
        .map(p => ({
            player: p,
            overs: 0, balls: 0, maidens: 0, runs: 0,
            wickets: 0, economy: 0, dots: 0, overBalls: 0, runsInOver: 0,
        }));

    state.striker = state.battingOrder[0] || null;
    state.nonStriker = state.battingOrder[1] || null;
    state.currentBowler = null; // User will select opening bowler for 2nd innings
    state.status = 'awaiting_bowler';
    state.currentOver = 0;
    state.currentBall = 0;
    state.freeHit = false;
}

// ======================================================
// Persistence
// ======================================================

export async function saveMatchState(state: MatchState): Promise<void> {
    await redis.set(`match:${state.matchId}`, JSON.stringify(state), 'EX', 86400);
}

export async function getMatchState(matchId: string): Promise<MatchState | null> {
    const raw = await redis.get(`match:${matchId}`);
    if (!raw) return null;
    
    const state: MatchState = JSON.parse(raw);
    
    // Re-link references that get severed during Redis JSON serialization 
    // This connects the active tracking objects (striker, currentBowler) back to 
    // the elements actually inside the battingOrder/bowlingOrder arrays.
    // If we skip this, modifying striker.runs doesn't update battingOrder[i].runs
    
    if (state.striker) {
        state.striker = state.battingOrder.find(b => b.player.id === state.striker?.player.id) || state.striker;
    }
    if (state.nonStriker) {
        state.nonStriker = state.battingOrder.find(b => b.player.id === state.nonStriker?.player.id) || state.nonStriker;
    }
    if (state.currentBowler) {
        state.currentBowler = state.bowlingOrder.find(b => b.player.id === state.currentBowler?.player.id) || state.currentBowler;
    }

    return state;
}
