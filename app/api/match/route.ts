import { NextRequest, NextResponse } from 'next/server';
import { initMatchState, processNextBall, saveMatchState, getMatchState, performToss, selectNextBatter, selectNextBowler } from '@/lib/matchEngine';
import { v4 as uuidv4 } from 'uuid';
import { getLeagueState, syncMatchToLeague } from '@/lib/leagueEngine';
import { emitToRoom } from '@/lib/socket-server';
import { getAuctionState } from '@/lib/auctionEngine';
import { getRoomState } from '@/lib/roomManager';
import { isBotUser, botChooseNextBatter, botChooseNextBowler, botTossDecision, ensureBotSelections } from '@/lib/botEngine';
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

            // Perform toss from database/redis if exists
            const tossKey = `toss:${rCode || roomCode}:${id}`;
            const tossData = await redis.get(tossKey);
            const tossResult = tossData ? JSON.parse(tossData) : undefined;

            // Fetch selections from Redis if they exist (for bots or pre-match flow)
            let homeSelection = body.homeSelection;
            let awaySelection = body.awaySelection;
            let stadiumId = body.stadiumId;

            if (fixtureId && rCode) {
                const leagueState = await getLeagueState(rCode);
                const fixture = leagueState?.fixtures.find(f => f.id === fixtureId);

                if (fixture) {
                    const getPreMatchSelection = async (uId: string) => {
                        const data = await redis.get(`selection:${rCode}:${fixtureId}:${uId}`);
                        return data ? JSON.parse(data) : null;
                    };

                    if (!homeSelection) homeSelection = await getPreMatchSelection(fixture.homeTeamUserId);
                    if (!homeSelection && rCode && fixture.id) {
                        homeSelection = await ensureBotSelections(rCode, fixture.id, fixture.homeTeamUserId);
                    }

                    if (!awaySelection) awaySelection = await getPreMatchSelection(fixture.awayTeamUserId);
                    if (!awaySelection && rCode && fixture.id) {
                        awaySelection = await ensureBotSelections(rCode, fixture.id, fixture.awayTeamUserId);
                    }

                    const auctionState = await getAuctionState(rCode);
                    const teams = auctionState?.teams || [];

                    const homeLeagueTeam = teams.find(t => t.userId === fixture.homeTeamUserId);
                    const awayLeagueTeam = teams.find(t => t.userId === fixture.awayTeamUserId);

                    // Map Stadium based on home team city
                    if (!stadiumId && homeLeagueTeam?.teamName) {
                        const { STADIUMS } = require('@/data/stadiums');
                        const { getTeamByName } = require('@/data/teams');
                        const team = getTeamByName(homeLeagueTeam.teamName);
                        if (team) {
                            const stadium = STADIUMS.find((s: any) => s.city === team.city);
                            if (stadium) stadiumId = stadium.id;
                        }
                    }

                    const mapToMatchTeam = (leagueTeam: any, selection: any) => {
                        let playingSquad = leagueTeam.squad;

                        if (selection?.selectedIds && selection.selectedIds.length > 0) {
                            playingSquad = playingSquad.filter((s: any) => selection.selectedIds.includes(s.player.id));
                        }

                        playingSquad = [...playingSquad].sort((a: any, b: any) => b.soldPrice - a.soldPrice);

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

                    if (homeLeagueTeam && awayLeagueTeam) {
                        hTeam = mapToMatchTeam(homeLeagueTeam, homeSelection);
                        aTeam = mapToMatchTeam(awayLeagueTeam, awaySelection);
                    }
                }
            }

            if (!hTeam || !aTeam) {
                return NextResponse.json({ error: 'Missing team data for initialization' }, { status: 400 });
            }

            const state = initMatchState(id, rCode, hTeam, aTeam, bodyPitchType || 'BALANCED', {
                tossResult,
                homeBattingOrder: homeSelection?.battingOrder,
                awayBattingOrder: awaySelection?.battingOrder,
                homeCaptainId: homeSelection?.captainId,
                awayCaptainId: awaySelection?.captainId,
                homeWkId: homeSelection?.wkId,
                awayWkId: awaySelection?.wkId,
                homeOpeningBowlerId: homeSelection?.openingBowlerId,
                awayOpeningBowlerId: awaySelection?.openingBowlerId,
                stadiumId,
            });

            // Auto-lock for bots
            const room = await getRoomState(rCode);
            if (room) {
                const homePlayer = room.players.find(p => p.userId === state.homeTeam.userId);
                const awayPlayer = room.players.find(p => p.userId === state.awayTeam.userId);
                
                if (homePlayer && isBotUser(homePlayer.username)) {
                    state.homeLocked = true;
                }
                if (awayPlayer && isBotUser(awayPlayer.username)) {
                    state.awayLocked = true;
                }

                // If both locked (e.g. both bots), start match immediately
                if (state.homeLocked && state.awayLocked) {
                    state.status = 'live';
                }
            }

            await saveMatchState(state);
            emitToRoom(rCode, 'match_update', { state });
            return NextResponse.json({ state });
        }

        if (action === 'lockSelection') {
            const { captainId, wkId, openingBowlerId, selectedIds } = body;
            let state = await getMatchState(matchId);
            if (!state) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

            const isHome = state.homeTeam.userId === session.userId;
            const isAway = state.awayTeam.userId === session.userId;

            if (!isHome && !isAway) {
                // Check if host acting for a bot
                const room = await getRoomState(state.roomCode);
                if (room?.hostId !== session.userId) {
                    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
                }
            }

            // Determine which team to update
            const targetTeam = isHome ? state.homeTeam : state.awayTeam;
            const targetPrefix = isHome ? 'home' : 'away';

            // Filter players and assign roles
            if (selectedIds && selectedIds.length === 11) {
                targetTeam.players = targetTeam.players.filter(p => selectedIds.includes(p.id));
                // Maintain order if possible? initMatchState handles the ordering from battingOrder usually.
                // For now, let's just make sure roles are set.
            }

            targetTeam.players.forEach(p => {
                p.isCaptain = p.id === captainId;
                p.isWicketKeeper = p.id === wkId;
            });

            if (isHome) {
                state.homeLocked = true;
                state.homeCaptainId = captainId;
                state.homeWkId = wkId;
                state.homeOpeningBowlerId = openingBowlerId;
            } else {
                state.awayLocked = true;
                state.awayCaptainId = captainId;
                state.awayWkId = wkId;
                state.awayOpeningBowlerId = openingBowlerId;
            }

            if (isHome) {
                state.homeBattingOrder = selectedIds;
            } else {
                state.awayBattingOrder = selectedIds;
            }

            // Sync players to battingOrder and bowlingOrder
            // This is critical because processNextBall uses these orders.
            // We need to re-run the parts of initMatchState that setup these orders.
            
            // For simplicity, let's just mark it as locked. 
            // The match only starts when BOTH are locked.
            if (state.homeLocked && state.awayLocked) {
                // Transition to live: Actually recreate the orders based on final selections
                const finalState = initMatchState(state.matchId, state.roomCode, state.homeTeam, state.awayTeam, state.pitchType, {
                    tossResult: state.toss,
                    homeCaptainId: state.homeCaptainId,
                    awayCaptainId: state.awayCaptainId,
                    homeWkId: state.homeWkId,
                    awayWkId: state.awayWkId,
                    homeOpeningBowlerId: state.homeOpeningBowlerId,
                    awayOpeningBowlerId: state.awayOpeningBowlerId,
                    homeBattingOrder: state.homeBattingOrder,
                    awayBattingOrder: state.awayBattingOrder,
                    stadiumId: state.stadiumId,
                });
                finalState.homeLocked = true;
                finalState.awayLocked = true;
                finalState.status = 'live';
                state = finalState;
            }

            await saveMatchState(state);
            emitToRoom(state.roomCode, 'match_update', { state });
            return NextResponse.json({ state });
        }

        if (action === 'toss') {
            const { roomCode: tossRoomCode, matchId: tossMatchId, fixtureId, homeTeam: tH, awayTeam: tA } = body;
            const id = tossMatchId || fixtureId;
            const toss = performToss(tH, tA);
            const tossKey = `toss:${tossRoomCode}:${id}`;
            await redis.set(tossKey, JSON.stringify(toss), 'EX', 86400);

            // If toss winner is a bot, auto-decide
            const room = await getRoomState(tossRoomCode);
            const winnerPlayer = room?.players.find(p => p.userId === toss.winnerId);
            if (winnerPlayer && isBotUser(winnerPlayer.username)) {
                toss.decision = botTossDecision(body.pitchType || 'BALANCED');
                await redis.set(tossKey, JSON.stringify(toss), 'EX', 86400);
            }

            emitToRoom(tossRoomCode, 'match_update', { toss, matchId: id });
            return NextResponse.json({ toss, matchId: id });
        }

        if (action === 'tossDecision') {
            const { roomCode: decRoomCode, matchId: decMatchId, fixtureId, decision } = body;
            if (decision !== 'bat' && decision !== 'bowl') {
                return NextResponse.json({ error: 'Decision must be bat or bowl' }, { status: 400 });
            }
            const id = decMatchId || fixtureId;
            const tossKey = `toss:${decRoomCode}:${id}`;
            const tossData = await redis.get(tossKey);
            if (!tossData) return NextResponse.json({ error: 'Toss not found' }, { status: 404 });

            const toss = JSON.parse(tossData);
            if (toss.winnerId !== session.userId) {
                return NextResponse.json({ error: 'Only toss winner can make decision' }, { status: 403 });
            }

            toss.decision = decision;
            await redis.set(tossKey, JSON.stringify(toss), 'EX', 86400);
            emitToRoom(decRoomCode, 'match_update', { toss });
            return NextResponse.json({ toss });
        }

        if (action === 'ball') {
            let state = await getMatchState(matchId);
            if (!state) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

            if (state.status === 'innings_break') {
                state.status = 'awaiting_bowler';
                await saveMatchState(state);
                emitToRoom(state.roomCode, 'match_update', { state });
                return NextResponse.json({ state, ballResult: null });
            }

            // Authentication/Authorization Check
            const battingTeamUserId = state.currentBatting === 'home' ? state.homeTeam.userId : state.awayTeam.userId;
            const bowlingTeamUserId = state.currentBatting === 'home' ? state.awayTeam.userId : state.homeTeam.userId;
            
            // Only bowling team can bowl
            if (session.userId !== bowlingTeamUserId) {
                // Host can also trigger (for convenience/testing)
                const room = await getRoomState(state.roomCode);
                if (room?.hostId !== session.userId) {
                    return NextResponse.json({ error: 'Only the bowling team can bowl' }, { status: 403 });
                }
            }

            if (state.status === 'awaiting_batter' || state.status === 'awaiting_bowler') {
                const teamUserId = state.status === 'awaiting_batter'
                    ? (state.currentBatting === 'home' ? state.homeTeam.userId : state.awayTeam.userId)
                    : (state.currentBatting === 'home' ? state.awayTeam.userId : state.homeTeam.userId);
                
                const room = await getRoomState(state.roomCode);
                const user = room?.players.find(p => p.userId === teamUserId);
                
                if (user && isBotUser(user.username)) {
                    if (state.status === 'awaiting_batter') {
                        const bId = botChooseNextBatter(state);
                        if (bId) selectNextBatter(state, bId);
                    } else {
                        const bId = botChooseNextBowler(state);
                        if (bId) selectNextBowler(state, bId);
                    }
                    await saveMatchState(state);
                    emitToRoom(state.roomCode, 'match_update', { state });
                    return NextResponse.json({ state, ballResult: null });
                }

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
            emitToRoom(state.roomCode, 'match_update', { state, ballResult: result.ballResult });

            // Auto-sync to league if match completed
            if (state.status === 'completed' && !wasCompleted) {
                const parts = matchId.split('-');
                if (parts.length >= 2 && parts[1].startsWith('fixture')) {
                    const fixtureId = parts.slice(1).join('-');
                    try {
                        const updatedLeague = await syncMatchToLeague(state.roomCode, fixtureId, state);
                        if (updatedLeague) {
                            emitToRoom(state.roomCode, 'league_update', { state: updatedLeague });
                        }
                    } catch (err) {
                        console.error('Failed to sync match to league:', err);
                    }
                }
            }

            return NextResponse.json({ state, ballResult: result.ballResult });
        }

        if (action === 'selectBatter') {
            const { batterId } = body;
            let state = await getMatchState(matchId);
            if (!state) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

            const battingTeamUserId = state.currentBatting === 'home' ? state.homeTeam.userId : state.awayTeam.userId;
            
            if (session.userId !== battingTeamUserId) {
                const room = await getRoomState(state.roomCode);
                if (room?.hostId !== session.userId) {
                    return NextResponse.json({ error: 'Only the batting team can select a batter' }, { status: 403 });
                }
            }

            state = selectNextBatter(state, batterId);
            await saveMatchState(state);
            emitToRoom(state.roomCode, 'match_update', { state });
            return NextResponse.json({ state });
        }

        if (action === 'selectBowler') {
            const { bowlerId } = body;
            let state = await getMatchState(matchId);
            if (!state) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

            const bowlingTeamUserId = state.currentBatting === 'home' ? state.awayTeam.userId : state.homeTeam.userId;

            if (session.userId !== bowlingTeamUserId) {
                const room = await getRoomState(state.roomCode);
                if (room?.hostId !== session.userId) {
                    return NextResponse.json({ error: 'Only the bowling team can select a bowler' }, { status: 403 });
                }
            }

            state = selectNextBowler(state, bowlerId);
            await saveMatchState(state);
            emitToRoom(state.roomCode, 'match_update', { state });
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
    const action = searchParams.get('action');
    const matchId = searchParams.get('matchId');
    const fixtureId = searchParams.get('fixtureId');
    const roomCode = searchParams.get('roomCode');

    if (action === 'getToss') {
        const id = matchId || fixtureId;
        if (!id || !roomCode) return NextResponse.json({ error: 'matchId/fixtureId and roomCode required' }, { status: 400 });
        const tossKey = `toss:${roomCode}:${id}`;
        const tossData = await redis.get(tossKey);
        return NextResponse.json({ toss: tossData ? JSON.parse(tossData) : null, matchId: id });
    }

    const id = matchId || fixtureId;
    if (!id) return NextResponse.json({ error: 'Match ID required' }, { status: 400 });

    const state = await getMatchState(id);
    return NextResponse.json({ state });
}
