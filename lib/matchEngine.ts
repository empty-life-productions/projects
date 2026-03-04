import redis from './redis';

export interface MatchState {
    matchId: string;
    roomCode: string;
    homeTeam: MatchTeam;
    awayTeam: MatchTeam;
    innings: number;
    status: 'scheduled' | 'toss' | 'toss_decision' | 'live' | 'innings_break' | 'awaiting_batter' | 'awaiting_bowler' | 'completed';
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
    // History
    firstInningsBattingOrder?: BatterState[];
    firstInningsBowlingOrder?: BowlerState[];
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
    overBalls: number;
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

function simulateBall(
    batter: BatterState,
    bowler: BowlerState,
    pitchType: string,
    phase: string,
    freeHit: boolean,
    target: number | null,
    currentScore: number,
    ballsRemaining: number
): BallResult {
    const { batMod, bowlMod } = getPitchModifier(pitchType, phase);

    let batSkill = batter.player.battingSkill * batMod;
    let bowlSkill = bowler.player.bowlingSkill * bowlMod;

    // Captain boost
    if (batter.player.isCaptain) batSkill += 3;
    if (bowler.player.isCaptain) bowlSkill += 2;

    // Form factor (random variance)
    const form = 0.85 + Math.random() * 0.3;
    const effectiveBat = batSkill * form;
    const effectiveBowl = bowlSkill * (0.85 + Math.random() * 0.3);

    // Pressure factor for chasing
    let pressureFactor = 1.0;
    if (target !== null && ballsRemaining > 0) {
        const requiredRate = ((target - currentScore) / ballsRemaining) * 6;
        if (requiredRate > 12) pressureFactor = 0.85;
        else if (requiredRate > 9) pressureFactor = 0.92;
        else if (requiredRate < 4) pressureFactor = 1.1;
    }

    // Extra chance (wide/no-ball) ~5%
    const extraRoll = Math.random();
    if (extraRoll < 0.03) {
        return {
            runs: 1, isWicket: false, isBoundary: false, isSix: false,
            isExtra: true, extraType: 'wide', extraRuns: 1, dismissalType: null,
            commentary: `Wide ball! One extra run.`,
        };
    }
    if (extraRoll < 0.05) {
        return {
            runs: 1, isWicket: false, isBoundary: false, isSix: false,
            isExtra: true, extraType: 'no_ball', extraRuns: 1, dismissalType: null,
            commentary: `No ball! Free hit coming up.`,
        };
    }

    // Wicket probability
    const baseWicketProb = 0.04;
    const wicketProb = baseWicketProb * (effectiveBowl / effectiveBat) * (1 / pressureFactor);

    if (!freeHit && Math.random() < Math.min(wicketProb, 0.15)) {
        const dismissals = ['bowled', 'caught', 'lbw', 'caught behind', 'run out', 'stumped'];
        const weights = bowler.player.role === 'BOWLER' ? [25, 35, 20, 10, 5, 5] : [20, 35, 15, 15, 10, 5];
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
    const runProbs = getRunProbabilities(effectiveBat, effectiveBowl, phase, pressureFactor);
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
    const commentary = options[Math.floor(Math.random() * options.length)];

    return {
        runs, isWicket: false, isBoundary, isSix,
        isExtra: false, extraType: null, extraRuns: 0, dismissalType: null,
        commentary,
    };
}

function getRunProbabilities(
    batSkill: number,
    bowlSkill: number,
    phase: string,
    pressureFactor: number
): [number, number][] {
    const skillRatio = batSkill / (batSkill + bowlSkill);

    // Base probabilities [runs, probability]
    let probs: [number, number][];

    if (phase === 'powerplay') {
        probs = [
            [0, 0.30 - skillRatio * 0.1],
            [1, 0.30],
            [2, 0.12],
            [3, 0.03],
            [4, 0.15 + skillRatio * 0.05],
            [6, 0.10 + skillRatio * 0.05],
        ];
    } else if (phase === 'death') {
        probs = [
            [0, 0.25 - skillRatio * 0.08],
            [1, 0.25],
            [2, 0.12],
            [3, 0.03],
            [4, 0.18 + skillRatio * 0.05],
            [6, 0.17 + skillRatio * 0.08],
        ];
    } else {
        probs = [
            [0, 0.35 - skillRatio * 0.08],
            [1, 0.30],
            [2, 0.12],
            [3, 0.03],
            [4, 0.12 + skillRatio * 0.05],
            [6, 0.08 + skillRatio * 0.03],
        ];
    }

    // Apply pressure factor
    if (pressureFactor < 1.0) {
        // Under pressure, more dots and wickets, fewer boundaries
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

    const bowlingOrder = firstBowlingTeam.players
        .filter(p => p.role !== 'BATSMAN' && p.role !== 'WICKET_KEEPER')
        .concat(firstBowlingTeam.players.filter(p => p.role === 'BATSMAN' || p.role === 'WICKET_KEEPER'))
        .slice(0, 6)
        .map(p => ({
            player: p,
            overs: 0, balls: 0, maidens: 0, runs: 0,
            wickets: 0, economy: 0, overBalls: 0,
        }));

    // Set opening bowler if specified
    let currentBowler = bowlingOrder[0] || null;
    if (openingBowlerId) {
        const specifiedBowler = bowlingOrder.find(b => b.player.id === openingBowlerId);
        if (specifiedBowler) currentBowler = specifiedBowler;
    }

    return {
        matchId, roomCode,
        homeTeam: { ...homeTeam, score: 0, wickets: 0, overs: 0, balls: 0, extras: 0, runRate: 0 },
        awayTeam: { ...awayTeam, score: 0, wickets: 0, overs: 0, balls: 0, extras: 0, runRate: 0 },
        innings: 1,
        status: 'live',
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
        (TOTAL_OVERS * 6) - (battingTeam.overs * 6 + battingTeam.balls)
    );

    // Process result
    state.freeHit = ballResult.extraType === 'no_ball';

    if (ballResult.isExtra) {
        battingTeam.score += ballResult.extraRuns;
        battingTeam.extras += ballResult.extraRuns;
        state.currentBowler.runs += ballResult.extraRuns;
        // Don't count as a legal delivery
    } else {
        // Legal delivery
        battingTeam.balls++;
        state.currentBall++;
        state.striker.balls++;
        state.currentBowler.overBalls++;

        if (ballResult.isWicket) {
            state.striker.isOut = true;
            state.striker.dismissal = ballResult.dismissalType || 'out';
            battingTeam.wickets++;
            state.currentBowler.wickets++;

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
            battingTeam.score += ballResult.runs;
            state.striker.runs += ballResult.runs;
            state.currentBowler.runs += ballResult.runs;

            if (ballResult.isBoundary) state.striker.fours++;
            if (ballResult.isSix) state.striker.sixes++;

            // Rotate strike on odd runs
            if (ballResult.runs % 2 === 1) {
                const temp = state.striker;
                state.striker = state.nonStriker;
                state.nonStriker = temp;
            }
        }

        // Check over completion
        if (state.currentBowler.overBalls >= 6) {
            state.currentBowler.overs++;
            state.currentBowler.overBalls = 0;
            state.currentBowler.economy = state.currentBowler.overs > 0
                ? Math.round((state.currentBowler.runs / state.currentBowler.overs) * 100) / 100
                : 0;

            battingTeam.overs++;
            battingTeam.balls = 0;
            state.currentBall = 0;
            state.currentOver++;

            // Rotate strike at end of over
            if (state.striker && state.nonStriker) {
                const temp = state.striker;
                state.striker = state.nonStriker;
                state.nonStriker = temp;
            }

            // Set status to awaiting_bowler — user must choose the next bowler
            // But only if the innings isn't about to end
            if (battingTeam.overs < TOTAL_OVERS && battingTeam.wickets < MAX_WICKETS) {
                if (state.status !== 'awaiting_batter') {
                    state.status = 'awaiting_bowler';
                    state.currentBowler = null;
                }
            }
        }
    }

    // Update strike rates and run rates
    state.striker && (state.striker.strikeRate = state.striker.balls > 0 ? Math.round((state.striker.runs / state.striker.balls) * 100 * 100) / 100 : 0);
    const totalBalls = battingTeam.overs * 6 + battingTeam.balls;
    battingTeam.runRate = totalBalls > 0 ? Math.round((battingTeam.score / totalBalls) * 6 * 100) / 100 : 0;

    // Update chase info for 2nd innings
    if (state.innings === 2 && state.target !== null) {
        state.runsRequired = state.target - battingTeam.score;
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
            const homeScore = state.homeTeam.score;
            const awayScore = state.awayTeam.score;
            if (homeScore > awayScore) {
                state.result = `${state.homeTeam.name} won by ${homeScore - awayScore} runs!`;
            } else if (awayScore > homeScore) {
                state.result = `${state.awayTeam.name} won by ${MAX_WICKETS - state.awayTeam.wickets} wickets!`;
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

    const batter = state.battingOrder.find(b => b.player.id === batterId && !b.isOut && b !== state.nonStriker);
    if (!batter) return state;

    state.striker = batter;
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

    state.battingOrder = newBattingTeam.players.map(p => ({
        player: p,
        runs: 0, balls: 0, fours: 0, sixes: 0,
        isOut: false, dismissal: '', strikeRate: 0,
    }));

    state.bowlingOrder = newBowlingTeam.players
        .filter(p => p.role !== 'BATSMAN' && p.role !== 'WICKET_KEEPER')
        .concat(newBowlingTeam.players.filter(p => p.role === 'BATSMAN' || p.role === 'WICKET_KEEPER'))
        .slice(0, 6)
        .map(p => ({
            player: p,
            overs: 0, balls: 0, maidens: 0, runs: 0,
            wickets: 0, economy: 0, overBalls: 0,
        }));

    state.striker = state.battingOrder[0] || null;
    state.nonStriker = state.battingOrder[1] || null;
    state.currentBowler = null; // User will select opening bowler for 2nd innings
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
    return JSON.parse(raw);
}
