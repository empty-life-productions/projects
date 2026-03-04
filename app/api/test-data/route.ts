import { NextRequest, NextResponse } from 'next/server';
import { initLeagueState, saveLeagueState, LeagueTeam } from '@/lib/leagueEngine';
import { getRoomState, updateRoomStatus } from '@/lib/roomManager';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const roomCode = searchParams.get('roomCode');
        if (!roomCode) return NextResponse.json({ success: false, error: "roomCode required" });
        const room = await getRoomState(roomCode);

        if (!room) {
            return NextResponse.json({ success: false, error: "Room not found. Make sure to run the UI browser flow first." });
        }

        // Generate a fake team for each player in the room
        const dummyTeams: LeagueTeam[] = room.players.map(p => ({
            userId: p.userId,
            username: p.username,
            teamName: p.teamName || 'Unknown Team',
            squad: generateSquad()
        }));

        // Let's directly construct the expected state and save it
        const state = initLeagueState(roomCode, dummyTeams);
        await saveLeagueState(state);

        // Mock auction state so pre-match can find squads
        const auctionState = {
            status: 'completed',
            teams: dummyTeams.map(t => ({
                userId: t.userId,
                username: t.username,
                teamName: t.teamName,
                purse: 50,
                squad: t.squad
            }))
        };
        const redis = require('@/lib/redis').default;
        await redis.set(`auction:${roomCode}`, JSON.stringify(auctionState), 'EX', 86400);

        await updateRoomStatus(roomCode, 'league');

        return NextResponse.json({ success: true, roomCode });
    } catch (e) {
        return NextResponse.json({ success: false, error: String(e) });
    }
}

function generateSquad() {
    const squad = [];
    // 8 overseas, 8 indians, all legit
    for (let i = 0; i < 8; i++) {
        squad.push({
            player: { id: `ind${i}`, name: `IndianStar_${i}`, role: i < 3 ? 'BATSMAN' : i < 6 ? 'BOWLER' : 'ALL_ROUNDER', battingSkill: 80, bowlingSkill: 80, nationality: 'Indian' },
            soldPrice: 1,
        });
    }
    for (let i = 0; i < 7; i++) {
        squad.push({
            player: { id: `ovs${i}`, name: `OverseasStar_${i}`, role: i < 3 ? 'BATSMAN' : i < 6 ? 'BOWLER' : 'ALL_ROUNDER', battingSkill: 80, bowlingSkill: 80, nationality: 'Overseas' },
            soldPrice: 1,
        });
    }
    return squad;
}
