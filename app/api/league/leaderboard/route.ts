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

    const stats = state.playerStats || [];

    return NextResponse.json({
        orangeCap: stats.sort((a, b) => b.runs - a.runs).slice(0, 10),
        purpleCap: stats.sort((a, b) => {
            if (b.wickets !== a.wickets) return b.wickets - a.wickets;
            const ecoA = a.oversBowled > 0 ? (a.runsConceded / a.oversBowled) * 6 : 99;
            const ecoB = b.oversBowled > 0 ? (b.runsConceded / b.oversBowled) * 6 : 99;
            return ecoA - ecoB;
        }).slice(0, 10),
        mvp: stats.sort((a, b) => b.impactScore - a.impactScore).slice(0, 10),
        
        highestScores: stats.sort((a, b) => b.highestScore - a.highestScore).slice(0, 5),
        boundaries: stats.sort((a, b) => b.fours - a.fours).slice(0, 5),
        sixes: stats.sort((a, b) => b.sixes - a.sixes).slice(0, 5),
        catches: stats.sort((a, b) => b.catches - a.catches).slice(0, 5),
        
        bestBowling: stats.sort((a, b) => {
            if (b.bestBowlingWickets !== a.bestBowlingWickets) return b.bestBowlingWickets - a.bestBowlingWickets;
            return a.bestBowlingRuns - b.bestBowlingRuns;
        }).slice(0, 5),
        
        economy: stats
            .filter(ps => ps.oversBowled >= 12) // Min 2 overs
            .sort((a, b) => {
                const ecoA = (a.runsConceded / a.oversBowled) * 6;
                const ecoB = (b.runsConceded / b.oversBowled) * 6;
                return ecoA - ecoB;
            }).slice(0, 5),
            
        strikeRate: stats
            .filter(ps => ps.balls >= 20) // Min 20 balls faced
            .sort((a, b) => {
                const srA = (a.runs / a.balls) * 100;
                const srB = (b.runs / b.balls) * 100;
                return srB - srA;
            }).slice(0, 5),
            
        centuries: stats.sort((a, b) => b.centuries - a.centuries).slice(0, 5),
        halfCenturies: stats.sort((a, b) => b.halfCenturies - a.halfCenturies).slice(0, 5),
        
        standings: state.standings.slice(0, 4)
    });
}
