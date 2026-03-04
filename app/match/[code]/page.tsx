'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useUserStore } from '@/lib/store';
import Navbar from '@/components/Navbar';
import PlayerAvatar from '@/components/PlayerAvatar';

interface MatchTeam {
    teamId: string;
    name: string;
    userId: string;
    score: number;
    wickets: number;
    overs: number;
    balls: number;
    extras: number;
    runRate: number;
    players: { id: string; name: string; role: string; battingSkill: number; bowlingSkill: number; isCaptain?: boolean; isWicketKeeper?: boolean }[];
}

interface BatterState {
    player: { id: string; name: string; role: string; battingSkill: number; bowlingSkill: number; isCaptain?: boolean };
    runs: number;
    balls: number;
    fours: number;
    sixes: number;
    isOut: boolean;
    dismissal: string;
    strikeRate: number;
}

interface BowlerState {
    player: { id: string; name: string; role: string; bowlingSkill: number; isCaptain?: boolean };
    overs: number;
    balls: number;
    maidens: number;
    runs: number;
    wickets: number;
    economy: number;
    overBalls: number;
}

interface TossResult {
    winnerId: string;
    winnerName: string;
    loserId: string;
    loserName: string;
    decision: 'bat' | 'bowl' | null;
}

interface MatchState {
    matchId: string;
    roomCode: string;
    homeTeam: MatchTeam;
    awayTeam: MatchTeam;
    innings: number;
    status: string;
    currentBatting: 'home' | 'away';
    pitchType: string;
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
    matchPhase: string;
    freeHit: boolean;
    runsRequired?: number;
    ballsRemaining?: number;
    requiredRunRate?: number;
    toss?: TossResult;
}

export default function MatchPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const code = params.code as string;
    const fixtureId = searchParams.get('fixtureId');
    const router = useRouter();
    const { userId, isLoggedIn, setUser } = useUserStore();

    const [match, setMatch] = useState<MatchState | null>(null);
    const [loading, setLoading] = useState(true);
    const [matchId, setMatchId] = useState('');

    // Toss state
    const [tossPhase, setTossPhase] = useState<'idle' | 'flipping' | 'result' | 'decided'>('idle');
    const [tossResult, setTossResult] = useState<TossResult | null>(null);
    const [coinFlipAnim, setCoinFlipAnim] = useState(false);

    useEffect(() => {
        const init = async () => {
            if (!isLoggedIn) {
                try {
                    const res = await fetch('/api/auth/me');
                    if (res.ok) {
                        const data = await res.json();
                        setUser(data.userId, data.username);
                    } else {
                        router.push('/login');
                        return;
                    }
                } catch {
                    router.push('/login');
                    return;
                }
            }
            setLoading(false);
        };
        init();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleToss = async () => {
        setTossPhase('flipping');
        setCoinFlipAnim(true);

        // Get team info
        const auctionRes = await fetch(`/api/auction?roomCode=${code}`);
        const auctionData = await auctionRes.json();
        const auction = auctionData.state;
        if (!auction) return;

        let homeTeam: any, awayTeam: any;
        if (fixtureId) {
            const leagueRes = await fetch(`/api/league?roomCode=${code}`);
            const leagueData = await leagueRes.json();
            const fixture = leagueData.state?.fixtures?.find((f: any) => f.id === fixtureId);
            if (fixture) {
                const h = auction.teams.find((t: any) => t.userId === fixture.homeTeamUserId);
                const a = auction.teams.find((t: any) => t.userId === fixture.awayTeamUserId);
                homeTeam = { teamId: h?.userId, name: h?.teamName, userId: h?.userId };
                awayTeam = { teamId: a?.userId, name: a?.teamName, userId: a?.userId };
            }
        }

        if (!homeTeam || !awayTeam) {
            homeTeam = { teamId: auction.teams[0]?.userId, name: auction.teams[0]?.teamName, userId: auction.teams[0]?.userId };
            awayTeam = { teamId: auction.teams[1]?.userId, name: auction.teams[1]?.teamName, userId: auction.teams[1]?.userId };
        }

        const id = `${code}-${fixtureId || 'match'}`;
        setMatchId(id);

        // Perform toss
        setTimeout(async () => {
            const res = await fetch('/api/match', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'toss',
                    roomCode: code,
                    matchId: id,
                    homeTeam,
                    awayTeam,
                    pitchType: 'BALANCED',
                }),
            });
            const data = await res.json();
            setCoinFlipAnim(false);
            setTossResult(data.toss);

            if (data.toss.decision) {
                // Bot already decided
                setTossPhase('decided');
                // Auto-init match after toss
                setTimeout(() => initMatch(id, data.toss), 2000);
            } else {
                setTossPhase('result');
            }
        }, 2000);
    };

    const handleTossDecision = async (decision: 'bat' | 'bowl') => {
        const res = await fetch('/api/match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'tossDecision',
                roomCode: code,
                matchId,
                decision,
            }),
        });
        const data = await res.json();
        setTossResult(data.toss);
        setTossPhase('decided');

        setTimeout(() => initMatch(matchId, data.toss), 1500);
    };

    const initMatch = async (id: string, toss?: TossResult) => {
        try {
            const res = await fetch('/api/match', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'init',
                    roomCode: code,
                    matchId: id,
                    fixtureId: fixtureId || undefined,
                    pitchType: 'BALANCED',
                }),
            });
            const data = await res.json();
            if (data.state) setMatch(data.state);
        } catch (err) {
            console.error('Match init failed:', err);
        }
    };

    const handleBall = async () => {
        if (!match) return;

        const res = await fetch('/api/match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'ball', matchId: match.matchId }),
        });
        const data = await res.json();
        if (data.state) setMatch(data.state);
    };

    const handleSelectBatter = async (batterId: string) => {
        if (!match) return;

        const res = await fetch('/api/match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'selectBatter', matchId: match.matchId, batterId }),
        });
        const data = await res.json();
        if (data.state) setMatch(data.state);
    };

    const handleSelectBowler = async (bowlerId: string) => {
        if (!match) return;

        const res = await fetch('/api/match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'selectBowler', matchId: match.matchId, bowlerId }),
        });
        const data = await res.json();
        if (data.state) setMatch(data.state);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-primary)' }}>
                <div className="shimmer w-16 h-16 rounded-2xl" />
            </div>
        );
    }

    // TOSS PHASE
    if (!match) {
        return (
            <div className="min-h-screen" style={{ background: 'var(--color-bg-primary)' }}>
                <Navbar />
                <main className="max-w-lg mx-auto px-6 pt-24 pb-12 text-center">
                    <h1 className="text-3xl font-black mb-8">🏏 The Toss</h1>

                    {tossPhase === 'idle' && (
                        <div className="space-y-6">
                            <p className="text-lg" style={{ color: 'var(--color-text-muted)' }}>
                                Ready for the coin toss?
                            </p>
                            <button onClick={handleToss} className="btn-primary text-xl px-12 py-4">
                                🪙 Flip the Coin
                            </button>
                        </div>
                    )}

                    {tossPhase === 'flipping' && (
                        <div className="space-y-6">
                            <div className="relative w-32 h-32 mx-auto">
                                <div className={`w-32 h-32 rounded-full border-4 border-yellow-400 flex items-center justify-center text-5xl ${coinFlipAnim ? 'animate-spin' : ''}`}
                                    style={{ background: 'linear-gradient(135deg, #FFD700, #FFA000)', animationDuration: '0.3s' }}>
                                    🪙
                                </div>
                            </div>
                            <p className="text-lg animate-pulse" style={{ color: 'var(--color-gold)' }}>
                                Flipping...
                            </p>
                        </div>
                    )}

                    {tossPhase === 'result' && tossResult && (
                        <div className="space-y-6">
                            <div className="w-32 h-32 mx-auto rounded-full border-4 border-yellow-400 flex items-center justify-center text-5xl"
                                style={{ background: 'linear-gradient(135deg, #FFD700, #FFA000)' }}>
                                🏆
                            </div>
                            <div className="panel p-6">
                                <p className="text-xl font-bold mb-2">{tossResult.winnerName}</p>
                                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>won the toss!</p>
                            </div>

                            {tossResult.winnerId === userId ? (
                                <div className="space-y-4">
                                    <p className="text-sm font-semibold" style={{ color: 'var(--color-gold)' }}>
                                        What would you like to do?
                                    </p>
                                    <div className="flex gap-4 justify-center">
                                        <button onClick={() => handleTossDecision('bat')}
                                            className="btn-primary text-lg px-8 py-3">
                                            🏏 Bat First
                                        </button>
                                        <button onClick={() => handleTossDecision('bowl')}
                                            className="btn-secondary text-lg px-8 py-3">
                                            🎯 Bowl First
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm animate-pulse" style={{ color: 'var(--color-text-muted)' }}>
                                    Waiting for {tossResult.winnerName} to make their decision...
                                </p>
                            )}
                        </div>
                    )}

                    {tossPhase === 'decided' && tossResult && (
                        <div className="space-y-6">
                            <div className="w-32 h-32 mx-auto rounded-full border-4 border-green-400 flex items-center justify-center text-5xl"
                                style={{ background: 'linear-gradient(135deg, #4CAF50, #2E7D32)' }}>
                                ✓
                            </div>
                            <div className="panel p-6">
                                <p className="text-xl font-bold mb-1">{tossResult.winnerName}</p>
                                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                                    won the toss and chose to <span className="gold-text font-bold uppercase">{tossResult.decision}</span> first
                                </p>
                            </div>
                            <p className="text-sm animate-pulse" style={{ color: 'var(--color-text-muted)' }}>
                                Setting up the match...
                            </p>
                        </div>
                    )}
                </main>
            </div>
        );
    }

    // MATCH PHASE
    const battingTeam = match.currentBatting === 'home' ? match.homeTeam : match.awayTeam;
    const bowlingTeam = match.currentBatting === 'home' ? match.awayTeam : match.homeTeam;
    const isUserBattingTeam = battingTeam.userId === userId;
    const isUserBowlingTeam = bowlingTeam.userId === userId;

    return (
        <div className="min-h-screen" style={{ background: 'var(--color-bg-primary)' }}>
            <Navbar />
            <main className="max-w-5xl mx-auto px-6 pt-24 pb-12">
                {/* Toss Result Banner */}
                {match.toss && (
                    <div className="mb-4 p-3 rounded-xl text-center text-sm" style={{
                        background: 'rgba(255,215,0,0.05)',
                        border: '1px solid rgba(255,215,0,0.2)',
                    }}>
                        🪙 <strong>{match.toss.winnerName}</strong> won the toss and chose to <strong className="gold-text">{match.toss.decision}</strong> first
                    </div>
                )}

                {/* Scoreboard */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                    {[match.homeTeam, match.awayTeam].map((team, i) => {
                        const isBatting = (match.currentBatting === 'home' && i === 0) || (match.currentBatting === 'away' && i === 1);
                        return (
                            <div key={team.teamId} className="panel relative overflow-hidden" style={{
                                borderColor: isBatting ? 'var(--color-gold)' : undefined,
                            }}>
                                {isBatting && (
                                    <div className="absolute top-0 left-0 w-full h-0.5" style={{ background: 'var(--color-gold)' }} />
                                )}
                                <div className="flex items-center justify-between mb-2">
                                    <div>
                                        <h3 className="text-sm font-bold">{team.name}</h3>
                                        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                                            {isBatting ? '🏏 Batting' : '🎯 Bowling'}
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-2xl font-black">
                                            {team.score}<span className="text-lg">/{team.wickets}</span>
                                        </p>
                                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                            ({team.overs}.{team.balls}) • RR: {team.runRate}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Target Info */}
                {match.innings === 2 && match.target && (
                    <div className="mb-4 p-3 rounded-xl text-center" style={{
                        background: 'rgba(255,193,7,0.08)',
                        border: '1px solid rgba(255,193,7,0.2)',
                    }}>
                        <span className="text-sm font-semibold" style={{ color: 'var(--color-gold)' }}>
                            Target: {match.target} • Need {match.runsRequired} runs from {match.ballsRemaining} balls • RRR: {match.requiredRunRate}
                        </span>
                    </div>
                )}

                <div className="grid lg:grid-cols-3 gap-6">
                    {/* Main Game Area */}
                    <div className="lg:col-span-2 space-y-4">
                        {/* Current Partnership */}
                        <div className="panel">
                            <h3 className="text-xs font-semibold tracking-wider uppercase mb-3" style={{ color: 'var(--color-text-muted)' }}>
                                At the Crease
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                {[match.striker, match.nonStriker].map((batter, i) => batter && (
                                    <div key={batter.player.id + i} className="p-3 rounded-xl" style={{
                                        background: i === 0 ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.03)',
                                        border: `1px solid ${i === 0 ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.05)'}`,
                                    }}>
                                        <div className="flex items-center gap-2 mb-2">
                                            <PlayerAvatar name={batter.player.name} size={32} />
                                            <div>
                                                <p className="text-sm font-bold">
                                                    {batter.player.name}
                                                    {batter.player.isCaptain && <span className="text-yellow-400 text-[10px] ml-1">(C)</span>}
                                                    {i === 0 && <span className="text-green-400 text-[10px] ml-1">*</span>}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-2xl font-black">{batter.runs}</span>
                                            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>({batter.balls})</span>
                                        </div>
                                        <div className="flex gap-3 text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
                                            <span>4s: {batter.fours}</span>
                                            <span>6s: {batter.sixes}</span>
                                            <span>SR: {batter.strikeRate}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Current Bowler */}
                        {match.currentBowler && (
                            <div className="panel">
                                <h3 className="text-xs font-semibold tracking-wider uppercase mb-2" style={{ color: 'var(--color-text-muted)' }}>
                                    Bowling
                                </h3>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <PlayerAvatar name={match.currentBowler.player.name} size={28} />
                                        <span className="text-sm font-bold">
                                            {match.currentBowler.player.name}
                                            {match.currentBowler.player.isCaptain && <span className="text-yellow-400 text-[10px] ml-1">(C)</span>}
                                        </span>
                                    </div>
                                    <div className="flex gap-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                        <span>{match.currentBowler.overs}-{match.currentBowler.maidens}-{match.currentBowler.runs}-{match.currentBowler.wickets}</span>
                                        <span>Econ: {match.currentBowler.economy}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Commentary */}
                        <div className="panel">
                            <h3 className="text-xs font-semibold tracking-wider uppercase mb-3" style={{ color: 'var(--color-text-muted)' }}>
                                Commentary
                            </h3>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                {match.commentary.slice(0, 20).map((c, i) => (
                                    <p key={i} className={`text-sm py-1.5 px-3 rounded-lg ${i === 0 ? 'font-semibold' : ''}`} style={{
                                        background: i === 0 ? 'rgba(255,215,0,0.05)' : 'transparent',
                                        color: i === 0 ? 'var(--color-gold)' : 'var(--color-text-muted)',
                                    }}>
                                        {c}
                                    </p>
                                ))}
                            </div>
                        </div>

                        {/* Ball Button */}
                        {match.status === 'live' && (
                            <button onClick={handleBall} className="btn-primary w-full text-lg py-4" style={{ animation: 'pulse 2s infinite' }}>
                                🏏 Bowl Next Ball
                            </button>
                        )}

                        {match.status === 'innings_break' && (
                            <div className="text-center space-y-4">
                                <div className="panel p-6">
                                    <h2 className="text-2xl font-black mb-2">Innings Break</h2>
                                    <p className="text-lg gold-text">
                                        Target: {match.target} runs
                                    </p>
                                </div>
                                <button onClick={handleBall} className="btn-primary text-lg px-8 py-4">
                                    ▶️ Start 2nd Innings
                                </button>
                            </div>
                        )}

                        {match.status === 'completed' && match.result && (
                            <div className="panel p-8 text-center">
                                <h2 className="text-3xl font-black mb-2">🏆 Match Over!</h2>
                                <p className="text-xl gold-text">{match.result}</p>
                                {fixtureId && (
                                    <button onClick={() => router.push(`/league/${code}`)} className="btn-primary mt-6">
                                        📊 Back to League
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Sidebar — Scorecard */}
                    <div className="space-y-4">
                        {/* Batting Card */}
                        <div className="panel">
                            <h3 className="text-xs font-semibold tracking-wider uppercase mb-3" style={{ color: 'var(--color-text-muted)' }}>
                                Batting — {battingTeam.name}
                            </h3>
                            <div className="space-y-1">
                                {match.battingOrder.filter(b => b.runs > 0 || b.balls > 0 || b.isOut).map((b, i) => (
                                    <div key={i} className="flex items-center justify-between text-xs py-1.5 px-2 rounded" style={{
                                        background: b.isOut ? 'rgba(239,68,68,0.05)' : 'rgba(255,255,255,0.02)',
                                    }}>
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                            <span className="truncate font-medium">
                                                {b.player.name}
                                                {b.player.isCaptain && <span className="text-yellow-400">(C)</span>}
                                            </span>
                                            {b.isOut && <span className="text-red-400 text-[10px] truncate">{b.dismissal}</span>}
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            <span className="font-bold">{b.runs}</span>
                                            <span style={{ color: 'var(--color-text-muted)' }}>({b.balls})</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Bowling Card */}
                        <div className="panel">
                            <h3 className="text-xs font-semibold tracking-wider uppercase mb-3" style={{ color: 'var(--color-text-muted)' }}>
                                Bowling — {bowlingTeam.name}
                            </h3>
                            <div className="space-y-1">
                                {match.bowlingOrder.filter(b => b.overs > 0 || b.overBalls > 0).map((b, i) => (
                                    <div key={i} className="flex items-center justify-between text-xs py-1.5 px-2 rounded" style={{
                                        background: 'rgba(255,255,255,0.02)',
                                    }}>
                                        <span className="truncate font-medium flex-1 min-w-0">{b.player.name}</span>
                                        <div className="flex items-center gap-3 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                                            <span>{b.overs}.{b.overBalls}-{b.maidens}-{b.runs}-{b.wickets}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {/* SELECT BATTER MODAL */}
            {match.status === 'awaiting_batter' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{
                    background: 'rgba(0,0,0,0.85)',
                    backdropFilter: 'blur(8px)',
                }}>
                    <div className="w-full max-w-md rounded-2xl overflow-hidden" style={{
                        background: 'var(--color-bg-primary)',
                        border: '1px solid var(--color-border)',
                    }}>
                        <div className="p-4 border-b" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}>
                            <h2 className="text-xl font-bold text-center">🏏 Choose Next Batter</h2>
                            <p className="text-xs text-center mt-1" style={{ color: 'var(--color-text-muted)' }}>
                                Wicket fallen! Select who comes in next.
                            </p>
                        </div>
                        <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
                            {match.battingOrder
                                .filter(b => !b.isOut && b !== match.striker && b !== match.nonStriker)
                                .map(b => (
                                    <button
                                        key={b.player.id}
                                        onClick={() => handleSelectBatter(b.player.id)}
                                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-all"
                                        style={{
                                            background: 'rgba(255,255,255,0.02)',
                                            border: '1px solid rgba(255,255,255,0.05)',
                                        }}
                                    >
                                        <PlayerAvatar name={b.player.name} size={36} />
                                        <div className="flex-1 text-left">
                                            <p className="font-semibold text-sm">
                                                {b.player.name}
                                                {b.player.isCaptain && <span className="text-yellow-400 text-[10px] ml-1">(C)</span>}
                                            </p>
                                            <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                                                {b.player.role.replace('_', ' ')} • BAT: {b.player.battingSkill}
                                            </p>
                                        </div>
                                        <span className="text-xs gold-text">→</span>
                                    </button>
                                ))}
                        </div>
                    </div>
                </div>
            )}

            {/* SELECT BOWLER MODAL */}
            {match.status === 'awaiting_bowler' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{
                    background: 'rgba(0,0,0,0.85)',
                    backdropFilter: 'blur(8px)',
                }}>
                    <div className="w-full max-w-md rounded-2xl overflow-hidden" style={{
                        background: 'var(--color-bg-primary)',
                        border: '1px solid var(--color-border)',
                    }}>
                        <div className="p-4 border-b" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}>
                            <h2 className="text-xl font-bold text-center">🎯 Choose Bowler</h2>
                            <p className="text-xs text-center mt-1" style={{ color: 'var(--color-text-muted)' }}>
                                Over completed. Select who bowls next.
                            </p>
                        </div>
                        <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
                            {match.bowlingOrder
                                .filter(b => b.overs < 4)
                                .map(b => (
                                    <button
                                        key={b.player.id}
                                        onClick={() => handleSelectBowler(b.player.id)}
                                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-all"
                                        style={{
                                            background: 'rgba(255,255,255,0.02)',
                                            border: '1px solid rgba(255,255,255,0.05)',
                                        }}
                                    >
                                        <PlayerAvatar name={b.player.name} size={36} />
                                        <div className="flex-1 text-left">
                                            <p className="font-semibold text-sm">
                                                {b.player.name}
                                                {b.player.isCaptain && <span className="text-yellow-400 text-[10px] ml-1">(C)</span>}
                                            </p>
                                            <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                                                BWL: {b.player.bowlingSkill} • {b.overs}/{4} overs • {b.wickets}w/{b.runs}r
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs font-bold">{b.overs}.{b.overBalls}</p>
                                            <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                                                Econ: {b.economy}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
