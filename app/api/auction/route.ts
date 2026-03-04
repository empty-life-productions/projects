import { NextRequest, NextResponse } from 'next/server';
import {
    initAuction,
    getAuctionState,
    nextPlayer,
    placeBid,
    sellCurrentPlayer,
    skipPlayer,
    skipSet,
    endAuction,
    saveAuctionState,
} from '@/lib/auctionEngine';
import { getRoomState, fillRoomWithBots } from '@/lib/roomManager';
import { TEAM_NAMES } from '@/data/players';
import { IPL_PLAYERS } from '@/data/players';
import { getRetentionState } from '@/lib/retentionEngine';
import { runBotBidding, isBotUser } from '@/lib/botEngine';

function getSession(request: NextRequest) {
    const sessionCookie = request.cookies.get('session');
    if (!sessionCookie?.value) return null;
    try { return JSON.parse(sessionCookie.value); } catch { return null; }
}

export async function POST(request: NextRequest) {
    const session = getSession(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    try {
        const { action, roomCode, amount } = await request.json();

        if (action === 'init') {
            let room = await getRoomState(roomCode);
            if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
            if (room.hostId !== session.userId) {
                return NextResponse.json({ error: 'Only host can start auction' }, { status: 403 });
            }

            // Auto-fill bots to 10 players if needed
            if (room.players.length < 10) {
                const missing = 10 - room.players.length;
                await fillRoomWithBots(roomCode, missing);
                // Refresh room state after adding bots
                const updatedRoom = await getRoomState(roomCode);
                if (updatedRoom) room = updatedRoom;
            }

            // Get retained player IDs to exclude from auction
            const retentionState = await getRetentionState(roomCode);
            const excludePlayerIds: string[] = [];
            if (retentionState) {
                retentionState.teams.forEach(t => t.retained.forEach(r => excludePlayerIds.push(r.playerId)));
            }

            const players = room.players.map((p, i) => ({
                userId: p.userId,
                username: p.username,
                teamName: p.teamName || TEAM_NAMES[i % TEAM_NAMES.length],
                // Carry over post-retention purse
                startingPurse: retentionState?.teams.find(t => t.userId === p.userId)?.purse,
            }));

            const state = await initAuction(roomCode, players, excludePlayerIds);

            // Merge retained players into each team's squad
            if (retentionState) {
                for (const retTeam of retentionState.teams) {
                    const auctionTeam = state.teams.find(t => t.userId === retTeam.userId);
                    if (!auctionTeam) continue;

                    for (const retained of retTeam.retained) {
                        const playerData = IPL_PLAYERS.find(p => p.id === retained.playerId);
                        if (!playerData) continue;

                        auctionTeam.squad.push({
                            player: playerData,
                            soldTo: {
                                userId: auctionTeam.userId,
                                username: auctionTeam.username,
                                teamName: auctionTeam.teamName,
                            },
                            soldPrice: retained.cost,
                        });
                    }
                }
                await saveAuctionState(roomCode, state);
            }

            return NextResponse.json({ state });
        }

        if (action === 'next') {
            let state = await nextPlayer(roomCode);
            if (!state) return NextResponse.json({ error: 'Auction not found' }, { status: 404 });

            // Run bot bidding after presenting new player
            if (state.status === 'bidding') {
                state = await runBotBidding(roomCode) || state;
            }

            return NextResponse.json({ state });
        }

        if (action === 'bid') {
            const room = await getRoomState(roomCode);
            if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

            const playerIndex = room.players.findIndex(p => p.userId === session.userId);
            const teamName = room.players[playerIndex]?.teamName || TEAM_NAMES[playerIndex % TEAM_NAMES.length];

            const result = await placeBid(roomCode, session.userId, session.username, teamName, amount);
            if (!result.success) {
                return NextResponse.json({ error: result.error, state: result.state }, { status: 400 });
            }

            // Run bot bidding after human bid
            let state = result.state;
            if (state.status === 'bidding') {
                state = await runBotBidding(roomCode) || state;
            }

            return NextResponse.json({ state });
        }

        if (action === 'sell') {
            const state = await sellCurrentPlayer(roomCode);
            return NextResponse.json({ state });
        }

        if (action === 'status') {
            const state = await getAuctionState(roomCode);
            return NextResponse.json({ state });
        }

        // Host overrides
        if (action === 'skipPlayer') {
            const room = await getRoomState(roomCode);
            if (!room || room.hostId !== session.userId) return NextResponse.json({ error: 'Host only' }, { status: 403 });
            const state = await skipPlayer(roomCode);
            return NextResponse.json({ state });
        }
        if (action === 'skipSet') {
            const room = await getRoomState(roomCode);
            if (!room || room.hostId !== session.userId) return NextResponse.json({ error: 'Host only' }, { status: 403 });
            const state = await skipSet(roomCode);
            return NextResponse.json({ state });
        }
        if (action === 'endAuction') {
            const room = await getRoomState(roomCode);
            if (!room || room.hostId !== session.userId) return NextResponse.json({ error: 'Host only' }, { status: 403 });
            const state = await endAuction(roomCode);
            return NextResponse.json({ state });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        console.error('Auction error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    const session = getSession(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const roomCode = searchParams.get('roomCode');
    if (!roomCode) return NextResponse.json({ error: 'Room code required' }, { status: 400 });

    const state = await getAuctionState(roomCode);
    return NextResponse.json({ state });
}

