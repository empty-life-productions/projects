import { NextRequest, NextResponse } from 'next/server';
import { getLeagueState } from '@/lib/leagueEngine';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const roomCode = searchParams.get('roomCode');

    if (!roomCode) {
        return NextResponse.json({ error: 'roomCode is required' }, { status: 400 });
    }

    const state = await getLeagueState(roomCode);
    if (!state) {
        return NextResponse.json({ error: 'League not found' }, { status: 404 });
    }

    return NextResponse.json({
        orangeCap: state.orangeCap,
        purpleCap: state.purpleCap,
        mvp: state.mvp,
        standings: state.standings.slice(0, 4), // Top 4 teams for quick view
        playerStats: state.playerStats.sort((a, b) => b.impactScore - a.impactScore).slice(0, 10) // Top 10 impact players
    });
}
