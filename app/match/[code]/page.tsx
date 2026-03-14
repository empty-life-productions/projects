'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useUserStore } from '@/lib/store';
import Navbar from '@/components/Navbar';
import { getSocket } from '@/lib/socket';
import PlayerAvatar from '@/components/PlayerAvatar';
import { STADIUMS, getStadiumById } from '@/data/stadiums';
import { getTeamByName } from '@/data/teams';
import { CricketPlayer } from '@/data/players';
import { StadiumCard } from '@/components/StadiumCard';

interface MatchTeam {
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
    dots: number;
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
    homeLocked?: boolean;
    awayLocked?: boolean;
    homeCaptainId?: string;
    awayCaptainId?: string;
    homeWkId?: string;
    awayWkId?: string;
    homeOpeningBowlerId?: string;
    awayOpeningBowlerId?: string;
    firstInningsBattingOrder?: BatterState[];
    firstInningsBowlingOrder?: BowlerState[];
    stadiumId?: string;
    homeBattingOrder?: string[];
    awayBattingOrder?: string[];
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
    const [hostId, setHostId] = useState('');
    const [activeInningsTab, setActiveInningsTab] = useState<1 | 2>(1);

    const [showNoBallBuzzer, setShowNoBallBuzzer] = useState(false);
    const prevCommentaryLength = useRef<number>(0);

    useEffect(() => {
        if (match && match.commentary.length > prevCommentaryLength.current) {
            const latestCommentary = match.commentary[0] || '';
            if (latestCommentary.toLowerCase().includes('no ball')) {
                setShowNoBallBuzzer(true);
                setTimeout(() => setShowNoBallBuzzer(false), 3500);
                
                try {
                    const audio = new Audio('/buzzer.mp3');
                    audio.volume = 0.5;
                    audio.play().catch(() => {});
                } catch (e) {}
            }
        }
        prevCommentaryLength.current = match?.commentary.length || 0;
    }, [match?.commentary]);

    const BOT_USERNAMES = [
        'Chennai Super Kings', 'Mumbai Indians', 'Royal Challengers Bengaluru', 'Kolkata Knight Riders',
        'Delhi Capitals', 'Sunrisers Hyderabad', 'Punjab Kings', 'Rajasthan Royals',
        'Lucknow Super Giants', 'Gujarat Titans',
    ];

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

            const roomRes = await fetch(`/api/rooms/${code}`);
            if (roomRes.ok) {
                const roomData = await roomRes.json();
                setHostId(roomData.room.hostId);
            }

            // Fetch existing match or toss state
            const id = `${code}-${fixtureId || 'match'}`;
            setMatchId(id);

            const matchRes = await fetch(`/api/match?action=status&matchId=${id}`);
            if (matchRes.ok) {
                const data = await matchRes.json();
                if (data.state) {
                    setMatch(data.state);
                } else {
                    // Check if toss exists
                    const tossRes = await fetch(`/api/match?action=getToss&roomCode=${code}&matchId=${id}`);
                    if (tossRes.ok) {
                        const tossData = await tossRes.json();
                        if (tossData.toss) {
                            setTossResult(tossData.toss);
                            setTossPhase(tossData.toss.decision ? 'decided' : 'result');
                        }
                    }
                }
            }

            setLoading(false);
        };
        init();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Socket.IO for real-time updates
    useEffect(() => {
        const socket = getSocket();
        if (!socket) return;

        const onConnect = () => {
            console.log('[Socket] MatchPage connected, joining room:', code);
            socket.emit('join-room', code);
        };

        if (socket.connected) onConnect();
        socket.on('connect', onConnect);

        socket.on('match_update', (data: any) => {
            if (data.state) {
                setMatch(data.state);
            }
            if (data.toss) {
                setTossResult(data.toss);
                if (data.toss.decision) setTossPhase('decided');
                else setTossPhase('result');
            }
        });

        return () => {
            socket.off('match_update');
        };
    }, [code]);

    // Bot Auto-play Effect
    useEffect(() => {
        if (!match || hostId !== userId) return;

        const isBotTurnToBowl = match.status === 'live' && BOT_USERNAMES.includes(
            (match.currentBatting === 'home' ? match.awayTeam : match.homeTeam).name
        );

        const isBotTurnToSelectBatter = match.status === 'awaiting_batter' && BOT_USERNAMES.includes(
            (match.currentBatting === 'home' ? match.homeTeam : match.awayTeam).name
        );

        const isBotTurnToSelectBowler = match.status === 'awaiting_bowler' && BOT_USERNAMES.includes(
            (match.currentBatting === 'home' ? match.awayTeam : match.homeTeam).name
        );

        if (isBotTurnToBowl || isBotTurnToSelectBatter || isBotTurnToSelectBowler) {
            const timer = setTimeout(() => {
                // For live matches, the API handles batter/bowler auto-selection transitions
                // when action=ball is called, but we still trigger handleBall to start the next delivery.
                // If it's specifically awaiting_batter or awaiting_bowler, handleBall won't work,
                // but the API call for 'ball' actually has logic to auto-select if bot is detected.
                // However, handleSelectBatter/Bowler are safer if status is awaiting.
                
                if (match.status === 'live') {
                    handleBall();
                } else if (match.status === 'awaiting_batter' || match.status === 'awaiting_bowler') {
                    // We trigger handleBall anyway because the API 'ball' action 
                    // has logic to handle bot transitions if it fails.
                    // Actually, let's just use handleBall as the driver.
                    handleBall();
                }
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [match?.status, match?.currentBall, match?.currentOver, match?.homeTeam?.score, match?.awayTeam?.score, hostId, userId]);

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
                    pitchType: 'BALANCED', // Default, but API will override based on stadium city
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

    const handleLockSelection = async (selection: { selectedIds: string[], captainId: string, wkId: string, openingBowlerId: string }) => {
        if (!match) return;
        const res = await fetch('/api/match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'lockSelection', matchId: match.matchId, roomCode: code, ...selection }),
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
                    <h1 className="text-3xl font-black mb-2">🪙 Toss Time!</h1>
                    {fixtureId && (
                        <p className="text-xs gold-text uppercase tracking-widest font-black mb-8 opacity-60">
                            Match #{fixtureId.split('-')[1]} • Venue: Loading...
                        </p>
                    )}

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
    const isHome = match.homeTeam.userId === userId;
    const isAway = match.awayTeam.userId === userId;
    const userTeam = isHome ? match.homeTeam : match.awayTeam;
    const isLocked = isHome ? match.homeLocked : match.awayLocked;

    if (match.status === 'awaiting_selection') {
        return (
            <div className="min-h-screen" style={{ background: 'var(--color-bg-primary)' }}>
                <Navbar />
                <main className="max-w-4xl mx-auto px-6 pt-24 pb-12">
                    <div className="mb-8 p-4 rounded-2xl text-center" style={{ background: 'rgba(255,215,0,0.05)', border: '1px solid rgba(255,215,0,0.2)' }}>
                        <h2 className="text-xl font-bold mb-1">📋 Team Selection</h2>
                        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                            {match.toss?.winnerName} won the toss and chose to <span className="gold-text font-bold uppercase">{match.toss?.decision}</span> first.
                        </p>
                    </div>

                    {!isHome && !isAway ? (
                        <div className="panel p-12 text-center">
                            <h3 className="text-xl font-bold mb-4">Spectating Selection</h3>
                            <p style={{ color: 'var(--color-text-muted)' }}>Waiting for teams to finalize their squads...</p>
                        </div>
                    ) : isLocked ? (
                        <div className="panel p-12 text-center space-y-4">
                            <div className="w-16 h-16 mx-auto rounded-full bg-green-500/20 flex items-center justify-center text-2xl text-green-500">✓</div>
                            <h3 className="text-xl font-bold">Selection Locked!</h3>
                            <p style={{ color: 'var(--color-text-muted)' }}>Waiting for opponent to lock their squad...</p>
                        </div>
                    ) : (
                        <MatchSelectionUI 
                            team={userTeam} 
                            onLock={handleLockSelection} 
                            isBattingFirst={(match.currentBatting === 'home' && isHome) || (match.currentBatting === 'away' && isAway)}
                            stadiumId={match.stadiumId}
                        />
                    )}
                </main>
            </div>
        );
    }

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

                {!isUserBattingTeam && !isUserBowlingTeam && (
                    <div className="mb-6 p-4 rounded-2xl flex items-center justify-between border-2 border-dashed"
                        style={{ background: 'rgba(212, 175, 55, 0.03)', borderColor: 'rgba(212, 175, 55, 0.2)' }}>
                        <div className="flex items-center gap-3">
                            <span className="text-2xl animate-pulse">👁️</span>
                            <div>
                                <h4 className="text-sm font-black gold-text uppercase tracking-widest">Spectator Mode</h4>
                                <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>You are watching live as {match.homeTeam.name} plays {match.awayTeam.name}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5 bg-black/40 px-3 py-1.5 rounded-full border border-white/5">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-[10px] font-bold text-white/50 tracking-tighter uppercase">Live Broadcast</span>
                        </div>
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
                                        <span>{match.currentBowler.overs}.{match.currentBowler.overBalls}-{match.currentBowler.maidens}-{match.currentBowler.runs}-{match.currentBowler.wickets}</span>
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
                        {match.status === 'live' && isUserBowlingTeam && (
                            <button onClick={handleBall} className="btn-primary w-full text-lg py-4" style={{ animation: 'pulse 2s infinite' }}>
                                🏏 Bowl Next Ball
                            </button>
                        )}

                        {match.status === 'live' && !isUserBowlingTeam && (
                            <div className="panel text-center py-4 border-dashed opacity-50">
                                <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                                    {isUserBattingTeam ? 'Waiting for bowler to bowl...' : 'Match in progress...'}
                                </p>
                            </div>
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
                        {/* Innings Tabs */}
                        <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                            {[1, 2].map((inn) => (
                                <button
                                    key={inn}
                                    onClick={() => setActiveInningsTab(inn as 1 | 2)}
                                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                                        activeInningsTab === inn 
                                            ? 'bg-gold text-black' 
                                            : 'text-white/50 hover:text-white hover:bg-white/5'
                                    }`}
                                >
                                    Innings {inn}
                                </button>
                            ))}
                        </div>

                        {/* Scorecard Content */}
                        {(() => {
                            const isFirstInnings = activeInningsTab === 1;
                            const displayBatting = isFirstInnings 
                                ? (match.innings === 1 ? match.battingOrder : match.firstInningsBattingOrder || []) 
                                : (match.innings === 2 ? match.battingOrder : []);
                            const displayBowling = isFirstInnings 
                                ? (match.innings === 1 ? match.bowlingOrder : match.firstInningsBowlingOrder || []) 
                                : (match.innings === 2 ? match.bowlingOrder : []);
                            const displayBattingTeam = isFirstInnings
                                ? (match.toss?.decision === 'bat' ? (match.toss.winnerId === match.homeTeam.userId ? match.homeTeam : match.awayTeam) : (match.toss?.winnerId === match.homeTeam.userId ? match.awayTeam : match.homeTeam))
                                : (match.toss?.decision === 'bat' ? (match.toss.winnerId === match.homeTeam.userId ? match.awayTeam : match.homeTeam) : (match.toss?.winnerId === match.homeTeam.userId ? match.homeTeam : match.awayTeam));
                            const displayBowlingTeam = isFirstInnings
                                ? (match.toss?.decision === 'bat' ? (match.toss.winnerId === match.homeTeam.userId ? match.awayTeam : match.homeTeam) : (match.toss?.winnerId === match.homeTeam.userId ? match.homeTeam : match.awayTeam))
                                : (match.toss?.decision === 'bat' ? (match.toss.winnerId === match.homeTeam.userId ? match.homeTeam : match.awayTeam) : (match.toss?.winnerId === match.homeTeam.userId ? match.awayTeam : match.homeTeam));

                            return (
                                <>
                                    {/* Batting Card */}
                                    <div className="panel">
                                        <h3 className="text-[10px] font-black tracking-widest uppercase mb-3 text-white/40">
                                            Batting — {displayBattingTeam.name}
                                        </h3>
                                        <div className="space-y-1">
                                            {displayBatting.filter(b => b.runs > 0 || b.balls > 0 || b.isOut || b.player.id === match.striker?.player.id || b.player.id === match.nonStriker?.player.id).map((b, i) => (
                                                <div key={i} className="flex items-center justify-between text-xs py-2 px-2.5 rounded-xl border border-white/[0.02]" style={{
                                                    background: b.isOut ? 'rgba(239,68,68,0.03)' : (b.player.id === match.striker?.player.id || b.player.id === match.nonStriker?.player.id ? 'rgba(34,197,94,0.05)' : 'rgba(255,255,255,0.02)'),
                                                    borderColor: b.player.id === match.striker?.player.id || b.player.id === match.nonStriker?.player.id ? 'rgba(34,197,94,0.1)' : undefined
                                                }}>
                                                    <div className="flex-1 min-w-0 pr-2">
                                                        <div className="flex items-center gap-1">
                                                            <span className="truncate font-bold text-white/90">
                                                                {b.player.name}
                                                                {b.player.isCaptain && <span className="text-yellow-400 text-[9px] ml-0.5" title="Captain">©</span>}
                                                            </span>
                                                            {(b.player.id === match.striker?.player.id || b.player.id === match.nonStriker?.player.id) && <span className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />}
                                                        </div>
                                                        {b.isOut ? (
                                                            <p className="text-[9px] text-red-400/80 italic truncate">{b.dismissal}</p>
                                                        ) : (
                                                            <p className="text-[9px] text-white/30 uppercase tracking-tighter">not out</p>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <div className="text-right">
                                                            <span className="font-black text-sm">{b.runs}</span>
                                                            <span className="text-[10px] text-white/40 ml-1">({b.balls})</span>
                                                        </div>
                                                        <div className="flex gap-2 w-24 justify-end text-[9px] text-white/30 font-medium">
                                                            <span title="Fours" className="flex items-center gap-0.5">
                                                                <span className="text-[8px] opacity-50">4s:</span>{b.fours || 0}
                                                            </span>
                                                            <span title="Sixes" className="flex items-center gap-0.5">
                                                                <span className="text-[8px] opacity-50">6s:</span>{b.sixes || 0}
                                                            </span>
                                                            <span className="text-white/60 font-bold ml-1">SR: {b.strikeRate}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Innings Summary Section */}
                                        <div className="mt-4 pt-3 border-t border-white/5 space-y-2">
                                            <div className="flex justify-between items-center px-2">
                                                <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Extras</span>
                                                <div className="text-right">
                                                    <span className="text-xs font-black text-white/90">{displayBattingTeam.extras}</span>
                                                    <p className="text-[8px] text-white/30">
                                                        (w{displayBattingTeam.extrasBreakdown?.wides || 0}, nb{displayBattingTeam.extrasBreakdown?.noBalls || 0}, b{displayBattingTeam.extrasBreakdown?.byes || 0}, lb{displayBattingTeam.extrasBreakdown?.legByes || 0})
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex justify-between items-center px-2 bg-white/[0.02] p-2 rounded-lg">
                                                <span className="text-[10px] font-bold gold-text uppercase tracking-widest">Total</span>
                                                <div className="text-right">
                                                    <span className="text-lg font-black">{displayBattingTeam.score}/{displayBattingTeam.wickets}</span>
                                                    <span className="text-[10px] text-white/40 ml-2">({displayBattingTeam.overs}.{displayBattingTeam.balls} ov)</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Bowling Card */}
                                    <div className="panel">
                                        <h3 className="text-[10px] font-black tracking-widest uppercase mb-3 text-white/40">
                                            Bowling — {displayBowlingTeam.name}
                                        </h3>
                                        <div className="space-y-1">
                                            {/* Table Header */}
                                            <div className="grid grid-cols-6 gap-2 px-2 mb-1 text-[8px] font-black text-white/20 uppercase tracking-tighter border-b border-white/5 pb-1">
                                                <div className="col-span-2">Bowler</div>
                                                <div className="text-center">O</div>
                                                <div className="text-center">M</div>
                                                <div className="text-center">R</div>
                                                <div className="text-center">W</div>
                                            </div>
                                            {displayBowling.filter(b => b.overs > 0 || b.overBalls > 0 || b.player.id === match.currentBowler?.player.id).map((b, i) => (
                                                <div key={i} className="grid grid-cols-6 gap-2 items-center text-[10px] py-2 px-2 rounded-lg bg-white/[0.02] border border-white/[0.01]" style={{
                                                    borderColor: b.player.id === match.currentBowler?.player.id ? 'var(--color-gold-muted)' : undefined,
                                                    background: b.player.id === match.currentBowler?.player.id ? 'rgba(212,175,55,0.05)' : undefined
                                                }}>
                                                    <div className="col-span-2 truncate font-bold text-white/80">
                                                        {b.player.name}
                                                        {b.player.id === match.currentBowler?.player.id && <span className="ml-1 text-[8px] gold-text">●</span>}
                                                    </div>
                                                    <div className="text-center font-medium text-white/60">{b.overs}.{b.overBalls}</div>
                                                    <div className="text-center font-medium text-white/60">{b.maidens}</div>
                                                    <div className="text-center font-black text-white/90">{b.runs}</div>
                                                    <div className="text-center font-black gold-text">{b.wickets}</div>
                                                </div>
                                            ))}
                                            {/* Extra stats footer */}
                                            {displayBowling.some(b => b.dots > 0) && (
                                                <p className="text-[8px] text-center mt-3 text-white/20 italic">
                                                    Dots and Economy stats available in detailed match report
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Fall of Wickets */}
                                    {displayBattingTeam.fow && displayBattingTeam.fow.length > 0 && (
                                        <div className="panel">
                                            <h3 className="text-[10px] font-black tracking-widest uppercase mb-3 text-white/40">
                                                Fall of Wickets
                                            </h3>
                                            <div className="flex flex-wrap gap-2">
                                                {displayBattingTeam.fow.map((f, i) => (
                                                    <div key={i} className="bg-white/5 border border-white/5 rounded-lg px-2 py-1.5 text-center min-w-[60px]">
                                                        <p className="text-[9px] font-black gold-text mb-0.5">{f.score}/{f.wickets}</p>
                                                        <p className="text-[7px] text-white/40 truncate w-full" title={f.batterName}>{f.batterName}</p>
                                                        <p className="text-[7px] text-white/20">({f.over}.{f.ball})</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            );
                        })()}
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
                            <div className="flex items-center justify-center gap-2 mb-2">
                                <span className="text-2xl animate-bounce">☝️</span>
                                <h2 className="text-xl font-black gold-text uppercase tracking-tighter">Wicket Fallen!</h2>
                            </div>
                            
                            {/* Gone out batter details */}
                            {battingTeam.fow && battingTeam.fow.length > 0 && (
                                <div className="mb-4 p-3 rounded-xl text-center bg-red-500/5 border border-red-500/20">
                                    <p className="text-xs font-bold text-red-400 uppercase tracking-widest mb-1">Batter Out</p>
                                    <p className="text-lg font-black text-white">
                                        {battingTeam.fow[battingTeam.fow.length - 1].batterName}
                                    </p>
                                    <p className="text-[10px] text-white/50">
                                        {match.commentary[0]?.includes('OUT!') ? match.commentary[0].split('!')[1].trim() : 'has departed'}
                                    </p>
                                </div>
                            )}

                            <h3 className="text-sm font-bold text-center">🏏 Choose Next Batter</h3>
                            <p className="text-xs text-center mt-1" style={{ color: 'var(--color-text-muted)' }}>
                                {isUserBattingTeam ? 'Select who comes in next to steady the ship.' : 'Waiting for batting team to select next player...'}
                            </p>
                        </div>
                        {isUserBattingTeam && (
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
                        )}
                        {!isUserBattingTeam && (
                            <div className="p-12 text-center">
                                <div className="text-4xl mb-4 animate-bounce">🏏</div>
                                <p className="text-sm font-medium opacity-50">Waiting for {battingTeam.name} to choose...</p>
                            </div>
                        )}
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
                                {isUserBowlingTeam ? 'Over completed. Select who bowls next.' : 'Over completed. Waiting for bowling team to select next player...'}
                            </p>
                        </div>
                        {isUserBowlingTeam && (
                            <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
                                {match.bowlingOrder
                                    .filter(b => b.overs < 4 && b.player.id !== (match as any).lastBowlerId)
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
                        )}
                        {!isUserBowlingTeam && (
                            <div className="p-12 text-center">
                                <div className="text-4xl mb-4 animate-bounce">🎯</div>
                                <p className="text-sm font-medium opacity-50">Waiting for {bowlingTeam.name} to choose...</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* No Ball Buzzer Overlay */}
            {showNoBallBuzzer && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none" style={{
                    background: 'radial-gradient(circle at center, rgba(239,68,68,0.2) 0%, rgba(239,68,68,0.4) 100%)',
                    animation: 'pulse 0.5s infinite alternate'
                }}>
                    <div className="bg-red-600 text-white border-4 border-white px-12 py-6 rounded-3xl transform -rotate-12 animate-bounce flex items-center gap-6" style={{
                        boxShadow: '0 0 50px rgba(220,38,38,0.8)'
                    }}>
                        <span className="text-6xl">🚨</span>
                        <div>
                            <h1 className="text-6xl font-black uppercase tracking-widest italic" style={{ textShadow: '2px 2px 0 #000' }}>NO BALL</h1>
                            <p className="text-2xl font-bold uppercase tracking-widest mt-2" style={{ textShadow: '1px 1px 0 #000' }}>FREE HIT!</p>
                        </div>
                        <span className="text-6xl">🚨</span>
                    </div>
                    {/* Flashing borders */}
                    <div className="absolute inset-0 border-[16px] border-red-500 animate-pulse opacity-50"></div>
                </div>
            )}
        </div>
    );
}

// --- Helper Components ---

function MatchSelectionUI({ team, onLock, isBattingFirst, stadiumId }: { 
    team: MatchTeam, 
    onLock: (s: any) => void,
    isBattingFirst: boolean,
    stadiumId?: string
}) {
    const stadium = stadiumId ? getStadiumById(stadiumId) : null;
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [captainId, setCaptainId] = useState('');
    const [wkId, setWkId] = useState('');
    const [openingBowlerId, setOpeningBowlerId] = useState('');

    // Pre-select top 11 by skill by default
    useEffect(() => {
        const initial = [...team.players]
            .sort((a, b) => (b.battingSkill + b.bowlingSkill) - (a.battingSkill + a.bowlingSkill))
            .slice(0, 11)
            .map(p => p.id);
        setSelectedIds(initial);
        
        const cap = team.players.find(p => p.isCaptain)?.id || initial[0];
        const wk = team.players.find(p => p.isWicketKeeper)?.id || team.players.find(p => p.role === 'WICKET_KEEPER')?.id || initial[0];
        const bowl = team.players.find(p => p.role === 'BOWLER')?.id || initial[0];
        
        setCaptainId(cap);
        setWkId(wk);
        setOpeningBowlerId(bowl);
    }, [team.players]);

    const togglePlayer = (id: string) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(prev => prev.filter(i => i !== id));
            if (captainId === id) setCaptainId('');
            if (wkId === id) setWkId('');
            if (openingBowlerId === id) setOpeningBowlerId('');
        } else if (selectedIds.length < 11) {
            const next = [...selectedIds, id];
            setSelectedIds(next);
            
            // Auto-assign roles
            const p = team.players.find(p => p.id === id);
            if (p) {
                if (!captainId) setCaptainId(id);
                if (!wkId && p.role === 'WICKET_KEEPER') setWkId(id);
                if (!openingBowlerId && (p.role === 'BOWLER' || p.role === 'ALL_ROUNDER')) setOpeningBowlerId(id);
            }
        }
    };

    const isValid = selectedIds.length === 11 && captainId && wkId && (isBattingFirst ? true : openingBowlerId);

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {stadium && <StadiumCard stadium={stadium} />}

            <div className="grid md:grid-cols-2 gap-8">
                {/* Squad List */}
                <div className="panel p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold">Pick Your 11</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-black ${selectedIds.length === 11 ? 'bg-green-500/20 text-green-500' : 'bg-yellow-500/20 text-yellow-500'}`}>
                            {selectedIds.length} / 11 SELECTED
                        </span>
                    </div>

                    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                        {team.players.map(p => {
                            const isSelected = selectedIds.includes(p.id);
                            const orderNum = selectedIds.indexOf(p.id) + 1;
                            return (
                                <div
                                    key={p.id}
                                    className={`w-full flex items-center justify-between p-3 rounded-xl transition-all border ${
                                        isSelected 
                                            ? 'bg-gold/10 border-gold/30 shadow-[0_0_15px_rgba(212,175,55,0.1)]' 
                                            : 'bg-white/5 border-white/5 opacity-60 grayscale hover:grayscale-0 hover:opacity-100'
                                    }`}
                                >
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        {/* Selection / Order Number */}
                                        <div 
                                            onClick={(e) => { e.stopPropagation(); togglePlayer(p.id); }}
                                            className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all font-black text-xs cursor-pointer ${
                                                isSelected 
                                                    ? 'bg-gold border-gold text-black shadow-[0_0_10px_rgba(212,175,55,0.4)]' 
                                                    : 'border-white/10 text-white/20 hover:border-white/30'
                                            }`}>
                                            {isSelected ? `#${orderNum}` : ''}
                                        </div>

                                        <PlayerAvatar name={p.name} size={32} />
                                        <div className="text-left flex-1 min-w-0 cursor-pointer" onClick={() => togglePlayer(p.id)}>
                                            <div className="flex items-center gap-1.5">
                                                <p className="text-sm font-bold truncate">{p.name}</p>
                                            </div>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <p className="text-[9px] opacity-50 uppercase tracking-tighter">{p.role.replace('_', ' ')}</p>
                                                {/* Role Shortcuts */}
                                                {isSelected && (
                                                    <div className="flex gap-1 ml-auto" onClick={e => e.stopPropagation()}>
                                                        <button 
                                                            onClick={() => setCaptainId(captainId === p.id ? '' : p.id)}
                                                            className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-black border transition-all ${captainId === p.id ? 'bg-yellow-500 border-yellow-400 text-black' : 'bg-white/5 border-white/10 text-white/30 hover:text-white'}`}
                                                            title="Captain"
                                                        >C</button>
                                                        <button 
                                                            onClick={() => setWkId(wkId === p.id ? '' : p.id)}
                                                            className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-black border transition-all ${wkId === p.id ? 'bg-orange-500 border-orange-400 text-black' : 'bg-white/5 border-white/10 text-white/30 hover:text-white'}`}
                                                            title="Wicket Keeper"
                                                        >WK</button>
                                                        {(p.role === 'BOWLER' || p.role === 'ALL_ROUNDER') && !isBattingFirst && (
                                                            <button 
                                                                onClick={() => setOpeningBowlerId(openingBowlerId === p.id ? '' : p.id)}
                                                                className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-black border transition-all ${openingBowlerId === p.id ? 'bg-red-500 border-red-400 text-black' : 'bg-white/5 border-white/10 text-white/30 hover:text-white'}`}
                                                                title="Opening Bowler"
                                                            >OB</button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right flex-shrink-0 ml-4 cursor-pointer" onClick={() => togglePlayer(p.id)}>
                                        <div className="flex flex-col items-end gap-0.5 text-[10px] font-black">
                                            <span className="text-blue-400">BAT:{p.battingSkill}</span>
                                            <span className="text-red-400">BWL:{p.bowlingSkill}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Roles & Order */}
                <div className="space-y-6">
                    <div className="panel p-6 space-y-6">
                        <h3 className="text-lg font-bold mb-4">Assign Roles</h3>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-black opacity-50 uppercase mb-2 block">Team Captain</label>
                                <select 
                                    value={captainId} 
                                    onChange={(e) => setCaptainId(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-gold/50 outline-none"
                                >
                                    <option value="">Select Captain</option>
                                    {team.players.filter(p => selectedIds.includes(p.id)).map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="text-xs font-black opacity-50 uppercase mb-2 block">Wicket Keeper</label>
                                <select 
                                    value={wkId} 
                                    onChange={(e) => setWkId(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-gold/50 outline-none"
                                >
                                    <option value="">Select WK</option>
                                    {team.players.filter(p => selectedIds.includes(p.id)).map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            {!isBattingFirst && (
                                <div>
                                    <label className="text-xs font-black opacity-50 uppercase mb-2 block text-red-400">Opening Bowler</label>
                                    <select 
                                        value={openingBowlerId} 
                                        onChange={(e) => setOpeningBowlerId(e.target.value)}
                                        className="w-full bg-black/40 border border-red-500/20 rounded-xl px-4 py-3 text-sm focus:border-red-500/50 outline-none"
                                    >
                                        <option value="">Select Opening Bowler</option>
                                        {team.players.filter(p => selectedIds.includes(p.id)).map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>

                        <button
                            disabled={!isValid}
                            onClick={() => onLock({ selectedIds, captainId, wkId, openingBowlerId })}
                            className={`w-full py-4 rounded-xl font-black text-lg transition-all ${
                                isValid 
                                    ? 'bg-gold text-black hover:scale-[1.02] shadow-[0_10px_30px_rgba(212,175,55,0.3)]' 
                                    : 'bg-white/5 text-white/20 cursor-not-allowed'
                            }`}
                        >
                            LOCK SQUAD & START →
                        </button>
                    </div>

                    <div className="panel p-4 bg-blue-500/5 border-blue-500/20">
                        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                            <span className="text-blue-400 font-bold">Pro Tip:</span> Since you are {isBattingFirst ? 'batting' : 'bowling'} first, make sure to pick your {isBattingFirst ? 'best batsmen' : 'best bowlers'} accordingly.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
