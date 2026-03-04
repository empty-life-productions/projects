import { NextRequest, NextResponse } from 'next/server';
import { initMatchState, processNextBall, saveMatchState, getMatchState, performToss, selectNextBatter, selectNextBowler } from '@/lib/matchEngine';
import { v4 as uuidv4 } from 'uuid';
import { getLeagueState } from '@/lib/leagueEngine';
import { getAuctionState } from '@/lib/auctionEngine';
import { getRoomState } from '@/lib/roomManager';
import { isBotUser, botChooseNextBatter, botChooseNextBowler, botTossDecision } from '@/lib/botEngine';
import redis from '@/lib/redis';

function getSession(request: NextRequest) {
    const sessionCookie = request.cookies.get('session');
    if (!sessionCookie?.value) return null;
    try { return JSON.parse(sessionCookie.value); } catch { return null; }
}

export async function POST(request: NextRequest) {
    const session = getSession(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    try {
        const body = await request.json();
        const { action, matchId, roomCode, homeTeam, awayTeam, pitchType } = body;

        if (action === 'init') {
            const { fixtureId, roomCode: bodyRoomCode, pitchType: bodyPitchType } = body;
            const rCode = roomCode || bodyRoomCode;
            const id = matchId || uuidv4();

            let hTeam = homeTeam;
            let aTeam = awayTeam;

            if (fixtureId && rCode) {
                const leagueState = await getLeagueState(rCode);
                const fixture = leagueState?.fixtures.find(f => f.id === fixtureId);

                if (fixture) {
                    const auctionState = await getAuctionState(rCode);
                    const teams = auctionState?.teams || [];

                    const homeLeagueTeam = teams.find(t => t.userId === fixture.homeTeamUserId);
                    const awayLeagueTeam = teams.find(t => t.userId === fixture.awayTeamUserId);

                    if (homeLeagueTeam && awayLeagueTeam) {
                        const getPreMatchSelection = async (uId: string) => {
                            const data = await redis.get(`selection:${rCode}:${fixtureId}:${uId}`);
                            return data ? JSON.parse(data) : null;
                        };

                        const homeSelection = await getPreMatchSelection(fixture.homeTeamUserId);
                        const awaySelection = await getPreMatchSelection(fixture.awayTeamUserId);

                        const mapToMatchTeam = (leagueTeam: any, selection: any) => {
                            let playingSquad = leagueTeam.squad;
                            const selectedIds = selection?.selectedIds || selection;

                            if (Array.isArray(selectedIds) && selectedIds.length === 11) {
                                playingSquad = leagueTeam.squad.filter((s: any) => selectedIds.includes(s.player.id));
                            } else {
                                playingSquad = [...leagueTeam.squad].sort((a: any, b: any) => b.soldPrice - a.soldPrice).slice(0, 11);
                            }

                            // Apply batting order if provided
                            const battingOrder = selection?.battingOrder;
                            if (battingOrder && battingOrder.length > 0) {
                                const ordered = battingOrder
                                    .map((id: string) => playingSquad.find((s: any) => s.player.id === id))
                                    .filter(Boolean);
                                const rest = playingSquad.filter((s: any) => !battingOrder.includes(s.player.id));
                                playingSquad = [...ordered, ...rest];
                            }

                            return {
                                teamId: leagueTeam.userId,
                                name: leagueTeam.teamName,
                                userId: leagueTeam.userId,
                                score: 0, wickets: 0, overs: 0, balls: 0, extras: 0, runRate: 0,
                                players: playingSquad.map((s: any) => ({
                                    id: s.player.id,
                                    name: s.player.name,
                                    role: s.player.role,
                                    battingSkill: s.player.battingSkill,
                                    bowlingSkill: s.player.bowlingSkill,
                                    isCaptain: s.player.id === selection?.captainId,
                                    isWicketKeeper: s.player.id === selection?.wkId,
                                }))
                            };
                        };

                        hTeam = mapToMatchTeam(homeLeagueTeam, homeSelection);
                        aTeam = mapToMatchTeam(awayLeagueTeam, awaySelection);
                    }
                }
            }

            if (!hTeam || !aTeam) {
                return NextResponse.json({ error: 'Missing team data for initialization' }, { status: 400 });
            }

            // Get toss result from redis if already performed
            const tossKey = `toss:${rCode || roomCode}:${id}`;
            const tossData = await redis.get(tossKey);
            const tossResult = tossData ? JSON.parse(tossData) : undefined;

            // Get selection data for options
            const homeSelData = body.homeSelection;
            const awaySelData = body.awaySelection;

            const state = initMatchState(id, rCode, hTeam, aTeam, bodyPitchType || 'BALANCED', {
                tossResult,
                homeBattingOrder: homeSelData?.battingOrder,
                awayBattingOrder: awaySelData?.battingOrder,
                homeCaptainId: homeSelData?.captainId,
                awayCaptainId: awaySelData?.captainId,
                homeWkId: homeSelData?.wkId,
                awayWkId: awaySelData?.wkId,
                homeOpeningBowlerId: homeSelData?.openingBowlerId,
                awayOpeningBowlerId: awaySelData?.openingBowlerId,
            });
            await saveMatchState(state);
            return NextResponse.json({ state });
        }

        if (action === 'toss') {
            const { roomCode: tossRoomCode, matchId: tossMatchId, homeTeam: tH, awayTeam: tA } = body;
            const toss = performToss(tH, tA);
            const tossKey = `toss:${tossRoomCode}:${tossMatchId}`;
            await redis.set(tossKey, JSON.stringify(toss), 'EX', 86400);

            // If toss winner is a bot, auto-decide
            const room = await getRoomState(tossRoomCode);
            const winnerPlayer = room?.players.find(p => p.userId === toss.winnerId);
            if (winnerPlayer && isBotUser(winnerPlayer.username)) {
                toss.decision = botTossDecision(body.pitchType || 'BALANCED');
                await redis.set(tossKey, JSON.stringify(toss), 'EX', 86400);
            }

            return NextResponse.json({ toss });
        }

        if (action === 'tossDecision') {
            const { roomCode: decRoomCode, matchId: decMatchId, decision } = body;
            if (decision !== 'bat' && decision !== 'bowl') {
                return NextResponse.json({ error: 'Decision must be bat or bowl' }, { status: 400 });
            }
            const tossKey = `toss:${decRoomCode}:${decMatchId}`;
            const tossData = await redis.get(tossKey);
            if (!tossData) return NextResponse.json({ error: 'Toss not found' }, { status: 404 });

            const toss = JSON.parse(tossData);
            if (toss.winnerId !== session.userId) {
                return NextResponse.json({ error: 'Only toss winner can make decision' }, { status: 403 });
            }

            toss.decision = decision;
            await redis.set(tossKey, JSON.stringify(toss), 'EX', 86400);
            return NextResponse.json({ toss });
        }

        if (action === 'ball') {
            let state = await getMatchState(matchId);
            if (!state) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

            if (state.status === 'innings_break') {
                state.status = 'awaiting_bowler';
                await saveMatchState(state);
                return NextResponse.json({ state, ballResult: null });
            }

            if (state.status === 'awaiting_batter' || state.status === 'awaiting_bowler') {
                return NextResponse.json({ error: `Waiting for ${state.status} selection`, state }, { status: 400 });
            }

            const wasCompleted = state.status === 'completed';
            const result = processNextBall(state);
            state = result.state;

            if (state.status === 'awaiting_batter' || state.status === 'awaiting_bowler') {
                const battingTeamUserId = state.currentBatting === 'home' ? state.homeTeam.userId : state.awayTeam.userId;
                const bowlingTeamUserId = state.currentBatting === 'home' ? state.awayTeam.userId : state.homeTeam.userId;
                const room = await getRoomState(state.roomCode);

                if (state.status === 'awaiting_batter') {
                    const battingUser = room?.players.find(p => p.userId === battingTeamUserId);
                    if (battingUser && isBotUser(battingUser.username)) {
                        const batterId = botChooseNextBatter(state);
                        if (batterId) selectNextBatter(state, batterId);
                    }
                }
                if (state.status === 'awaiting_bowler') {
                    const bowlingUser = room?.players.find(p => p.userId === bowlingTeamUserId);
                    if (bowlingUser && isBotUser(bowlingUser.username)) {
                        const bowlerId = botChooseNextBowler(state);
                        if (bowlerId) selectNextBowler(state, bowlerId);
                    }
                }
            }

            await saveMatchState(state);

            // Hook: If the match just completed, update the League State
            if (!wasCompleted && state.status === 'completed' && state.result && state.roomCode && state.roomCode !== state.matchId) {
                try {
                    const firstInnBatTeam = state.currentBatting === 'home' ? state.awayTeam : state.homeTeam;
                    const secondInnBatTeam = state.currentBatting === 'home' ? state.homeTeam : state.awayTeam;

                    const batStats1 = (state.firstInningsBattingOrder || []).map(b => ({
                        playerId: b.player.id, playerName: b.player.name,
                        teamName: firstInnBatTeam.name, teamId: firstInnBatTeam.userId,
                        runs: b.runs, balls: b.balls, fours: b.fours, sixes: b.sixes, isOut: b.isOut
                    }));
                    const batStats2 = state.battingOrder.map(b => ({
                        playerId: b.player.id, playerName: b.player.name,
                        teamName: secondInnBatTeam.name, teamId: secondInnBatTeam.userId,
                        runs: b.runs, balls: b.balls, fours: b.fours, sixes: b.sixes, isOut: b.isOut
                    }));

                    const bowlStats1 = (state.firstInningsBowlingOrder || []).map(b => ({
                        playerId: b.player.id, playerName: b.player.name,
                        teamName: secondInnBatTeam.name, teamId: secondInnBatTeam.userId,
                        overs: b.overs, balls: b.overBalls, runs: b.runs, wickets: b.wickets
                    }));
                    const bowlStats2 = state.bowlingOrder.map(b => ({
                        playerId: b.player.id, playerName: b.player.name,
                        teamName: firstInnBatTeam.name, teamId: firstInnBatTeam.userId,
                        overs: b.overs, balls: b.overBalls, runs: b.runs, wickets: b.wickets
                    }));

                    let winnerUserId = null;
                    if (state.homeTeam.score > state.awayTeam.score) winnerUserId = state.homeTeam.userId;
                    else if (state.awayTeam.score > state.homeTeam.score) winnerUserId = state.awayTeam.userId;

                    const matchResult = {
                        homeUserId: state.homeTeam.userId,
                        awayUserId: state.awayTeam.userId,
                        homeScore: state.homeTeam.score,
                        homeWickets: state.homeTeam.wickets,
                        homeOvers: state.homeTeam.overs,
                        homeBalls: state.homeTeam.balls,
                        awayScore: state.awayTeam.score,
                        awayWickets: state.awayTeam.wickets,
                        awayOvers: state.awayTeam.overs,
                        awayBalls: state.awayTeam.balls,
                        result: state.result,
                        winnerUserId,
                        battingStats: [...batStats1, ...batStats2],
                        bowlingStats: [...bowlStats1, ...bowlStats2],
                    };

                    const url = new URL('/api/league', request.url);
                    await fetch(url.toString(), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Cookie': request.headers.get('cookie') || '' },
                        body: JSON.stringify({
                            action: 'completeMatch',
                            roomCode: state.roomCode,
                            matchId: state.matchId,
                            matchResult,
                        })
                    });
                } catch (err) {
                    console.error('Failed to trigger league completeMatch:', err);
                }
            }

            return NextResponse.json({ state, ballResult: result.ballResult });
        }

        if (action === 'selectBatter') {
            const { batterId } = body;
            let state = await getMatchState(matchId);
            if (!state) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

            state = selectNextBatter(state, batterId);
            await saveMatchState(state);
            return NextResponse.json({ state });
        }

        if (action === 'selectBowler') {
            const { bowlerId } = body;
            let state = await getMatchState(matchId);
            if (!state) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

            state = selectNextBowler(state, bowlerId);
            await saveMatchState(state);
            return NextResponse.json({ state });
        }

        if (action === 'status') {
            const state = await getMatchState(matchId);
            return NextResponse.json({ state });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        console.error('Match error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    const session = getSession(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const matchId = searchParams.get('matchId');
    if (!matchId) return NextResponse.json({ error: 'Match ID required' }, { status: 400 });

    const state = await getMatchState(matchId);
    return NextResponse.json({ state });
}
