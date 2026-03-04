'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useUserStore } from '@/lib/store';
import Navbar from '@/components/Navbar';
import PlayerAvatar from '@/components/PlayerAvatar';

interface SquadPlayer {
    player: {
        id: string;
        name: string;
        role: 'BATSMAN' | 'BOWLER' | 'ALL_ROUNDER' | 'WICKET_KEEPER';
        battingSkill: number;
        bowlingSkill: number;
        nationality?: string;
    };
    soldPrice: number;
}

interface TeamData {
    userId: string;
    username: string;
    teamName: string;
    squad: SquadPlayer[];
}

export default function PreMatchSelectionPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const code = params.code as string;
    const fixtureId = searchParams.get('fixtureId');
    const router = useRouter();
    const { userId, isLoggedIn, setUser } = useUserStore();

    const [myTeam, setMyTeam] = useState<TeamData | null>(null);
    const [opponentTeam, setOpponentTeam] = useState<TeamData | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [battingOrder, setBattingOrder] = useState<string[]>([]);
    const [captainId, setCaptainId] = useState<string>('');
    const [wkId, setWkId] = useState<string>('');
    const [openingBowlerId, setOpeningBowlerId] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [locked, setLocked] = useState(false);
    const [opponentLocked, setOpponentLocked] = useState(false);
    const [error, setError] = useState('');

    const roleColors: Record<string, string> = {
        BATSMAN: '#4FC3F7',
        BOWLER: '#EF5350',
        ALL_ROUNDER: '#66BB6A',
        WICKET_KEEPER: '#FFA726',
    };

    const roleEmoji: Record<string, string> = {
        BATSMAN: '🏏',
        BOWLER: '🎯',
        ALL_ROUNDER: '⭐',
        WICKET_KEEPER: '🧤',
    };

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

            // Get auction state to find squads
            const auctionRes = await fetch(`/api/auction?roomCode=${code}`);
            if (!auctionRes.ok) return;
            const auctionData = await auctionRes.json();
            const auction = auctionData.state;
            if (!auction) return;

            // Determine teams for this fixture
            if (fixtureId) {
                const leagueRes = await fetch(`/api/league?roomCode=${code}`);
                if (leagueRes.ok) {
                    const leagueData = await leagueRes.json();
                    const fixture = leagueData.state?.fixtures?.find((f: any) => f.id === fixtureId);
                    if (fixture) {
                        const home = auction.teams.find((t: any) => t.userId === fixture.homeTeamUserId);
                        const away = auction.teams.find((t: any) => t.userId === fixture.awayTeamUserId);
                        if (home?.userId === userId) {
                            setMyTeam(home);
                            setOpponentTeam(away);
                        } else if (away?.userId === userId) {
                            setMyTeam(away);
                            setOpponentTeam(home);
                        }
                    }
                }
            } else {
                const myTeamData = auction.teams.find((t: any) => t.userId === userId);
                setMyTeam(myTeamData || null);
            }

            // Check existing selection
            const selRes = await fetch(`/api/selection?roomCode=${code}${fixtureId ? `&fixtureId=${fixtureId}` : ''}&teamId=${userId}`);
            if (selRes.ok) {
                const selData = await selRes.json();
                if (selData.selectedIds?.length === 11) {
                    setSelectedIds(selData.selectedIds);
                    setBattingOrder(selData.battingOrder || selData.selectedIds);
                    setCaptainId(selData.captainId || '');
                    setWkId(selData.wkId || '');
                    setOpeningBowlerId(selData.openingBowlerId || '');
                    setLocked(true);
                }
            }

            setLoading(false);
        };
        init();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Poll for opponent lock status
    useEffect(() => {
        if (!locked || !opponentTeam) return;
        const interval = setInterval(async () => {
            const res = await fetch(`/api/selection?roomCode=${code}${fixtureId ? `&fixtureId=${fixtureId}` : ''}&teamId=${opponentTeam.userId}`);
            if (res.ok) {
                const data = await res.json();
                if (data.selectedIds?.length === 11) {
                    setOpponentLocked(true);
                }
            }
        }, 2000);
        return () => clearInterval(interval);
    }, [locked, opponentTeam, code, fixtureId]);

    const handleTogglePlayer = (playerId: string) => {
        if (locked) return;

        const willRemove = selectedIds.includes(playerId);
        const willAdd = !willRemove && selectedIds.length < 11;

        if (willRemove) {
            setSelectedIds(prev => prev.filter(id => id !== playerId));
            setBattingOrder(prev => prev.filter(id => id !== playerId));
            setCaptainId(c => c === playerId ? '' : c);
            setWkId(w => w === playerId ? '' : w);
            setOpeningBowlerId(o => o === playerId ? '' : o);
        } else if (willAdd) {
            setSelectedIds(prev => [...prev, playerId]);
            setBattingOrder(prev => prev.includes(playerId) ? prev : [...prev, playerId]);
        }
    };

    const handleMoveUp = (playerId: string) => {
        setBattingOrder(prev => {
            const idx = prev.indexOf(playerId);
            if (idx <= 0) return prev;
            const newOrder = [...prev];
            [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
            return newOrder;
        });
    };

    const handleMoveDown = (playerId: string) => {
        setBattingOrder(prev => {
            const idx = prev.indexOf(playerId);
            if (idx < 0 || idx >= prev.length - 1) return prev;
            const newOrder = [...prev];
            [newOrder[idx + 1], newOrder[idx]] = [newOrder[idx], newOrder[idx + 1]];
            return newOrder;
        });
    };

    const handleLock = async () => {
        if (selectedIds.length !== 11) {
            setError('Select exactly 11 players');
            return;
        }
        if (!captainId) {
            setError('Please select a Captain');
            return;
        }
        if (!wkId) {
            setError('Please select a Wicket Keeper');
            return;
        }
        if (!openingBowlerId) {
            setError('Please select an Opening Bowler');
            return;
        }

        try {
            const res = await fetch('/api/selection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomCode: code,
                    teamId: userId,
                    selectedIds,
                    battingOrder,
                    captainId,
                    wkId,
                    openingBowlerId,
                    fixtureId: fixtureId || undefined,
                }),
            });
            if (res.ok) {
                setLocked(true);
                setError('');
            }
        } catch (err) {
            console.error('Lock failed:', err);
        }
    };

    const handleStartMatch = async () => {
        try {
            await fetch('/api/league', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'lockPreMatch',
                    roomCode: code,
                    fixtureId: fixtureId,
                }),
            });
            router.push(`/match/${code}?fixtureId=${fixtureId || ''}`);
        } catch (err) {
            console.error('Failed to start match:', err);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-primary)' }}>
                <div className="shimmer w-16 h-16 rounded-2xl" />
            </div>
        );
    }

    return (
        <div className="min-h-screen" style={{ background: 'var(--color-bg-primary)' }}>
            <Navbar />
            <main className="max-w-4xl mx-auto px-6 pt-24 pb-12">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold">Playing 11 Selection</h1>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            Select your playing XI, set batting order, and assign roles
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className={`text-xs px-3 py-1.5 rounded-full font-semibold ${selectedIds.length === 11 ? 'bg-green-900/30 text-green-400' : 'bg-yellow-900/30 text-yellow-400'}`}>
                            {selectedIds.length}/11 Selected
                        </span>
                    </div>
                </div>

                {error && (
                    <div className="mb-4 p-3 rounded-lg text-sm font-semibold" style={{
                        background: 'rgba(239,68,68,0.1)',
                        color: 'var(--color-danger)',
                        border: '1px solid rgba(239,68,68,0.3)',
                    }}>
                        ⚠️ {error}
                    </div>
                )}

                <div className="grid lg:grid-cols-5 gap-6">
                    {/* Squad Selection */}
                    <div className="lg:col-span-3">
                        <div className="panel">
                            <h3 className="text-sm font-semibold tracking-wider uppercase mb-4" style={{ color: 'var(--color-text-muted)' }}>
                                {myTeam?.teamName || 'Your Squad'} — Full Squad
                            </h3>
                            <div className="space-y-2">
                                {myTeam?.squad.map(({ player, soldPrice }) => {
                                    const isSelected = selectedIds.includes(player.id);
                                    return (
                                        <div
                                            key={player.id}
                                            onClick={() => handleTogglePlayer(player.id)}
                                            className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${locked ? 'pointer-events-none opacity-60' : ''}`}
                                            style={{
                                                background: isSelected ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.02)',
                                                border: `1px solid ${isSelected ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.05)'}`,
                                            }}
                                        >
                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-green-500 border-green-500' : 'border-white/20'}`}>
                                                {isSelected && <span className="text-[10px]">✓</span>}
                                            </div>
                                            <PlayerAvatar name={player.name} size={36} />
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-sm truncate">{player.name}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
                                                        background: `${roleColors[player.role]}15`,
                                                        color: roleColors[player.role],
                                                    }}>
                                                        {roleEmoji[player.role]} {player.role.replace('_', ' ')}
                                                    </span>
                                                    {player.nationality === 'Overseas' && (
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-400">🌍 OS</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="text-right flex-shrink-0">
                                                <p className="text-xs font-bold" style={{ color: 'var(--color-text-muted)' }}>
                                                    BAT {player.battingSkill} | BWL {player.bowlingSkill}
                                                </p>
                                                <p className="text-[10px] gold-text">₹{soldPrice} Cr</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Batting Order + Roles */}
                    <div className="lg:col-span-2 space-y-4">
                        {/* Role Assignment */}
                        {selectedIds.length === 11 && !locked && (
                            <div className="panel">
                                <h3 className="text-sm font-semibold tracking-wider uppercase mb-3" style={{ color: 'var(--color-text-muted)' }}>
                                    Assign Roles
                                </h3>
                                <div className="space-y-3">
                                    {/* Captain */}
                                    <div>
                                        <label className="text-xs font-semibold mb-1 block" style={{ color: '#FFD700' }}>🏏 Captain</label>
                                        <select
                                            value={captainId}
                                            onChange={e => setCaptainId(e.target.value)}
                                            className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-sm"
                                        >
                                            <option value="">Select Captain...</option>
                                            {selectedIds.map(id => {
                                                const p = myTeam?.squad.find(s => s.player.id === id);
                                                return p ? <option key={id} value={id}>{p.player.name}</option> : null;
                                            })}
                                        </select>
                                    </div>
                                    {/* Wicket Keeper */}
                                    <div>
                                        <label className="text-xs font-semibold mb-1 block" style={{ color: '#FFA726' }}>🧤 Wicket Keeper</label>
                                        <select
                                            value={wkId}
                                            onChange={e => setWkId(e.target.value)}
                                            className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-sm"
                                        >
                                            <option value="">Select WK...</option>
                                            {selectedIds.map(id => {
                                                const p = myTeam?.squad.find(s => s.player.id === id);
                                                return p ? <option key={id} value={id}>{p.player.name}</option> : null;
                                            })}
                                        </select>
                                    </div>
                                    {/* Opening Bowler */}
                                    <div>
                                        <label className="text-xs font-semibold mb-1 block" style={{ color: '#EF5350' }}>🎯 Opening Bowler</label>
                                        <select
                                            value={openingBowlerId}
                                            onChange={e => setOpeningBowlerId(e.target.value)}
                                            className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-sm"
                                        >
                                            <option value="">Select Opening Bowler...</option>
                                            {selectedIds
                                                .filter(id => {
                                                    const p = myTeam?.squad.find(s => s.player.id === id);
                                                    return p && (p.player.role === 'BOWLER' || p.player.role === 'ALL_ROUNDER');
                                                })
                                                .map(id => {
                                                    const p = myTeam?.squad.find(s => s.player.id === id);
                                                    return p ? <option key={id} value={id}>{p.player.name}</option> : null;
                                                })}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Batting Order */}
                        {selectedIds.length > 0 && (
                            <div className="panel">
                                <h3 className="text-sm font-semibold tracking-wider uppercase mb-3" style={{ color: 'var(--color-text-muted)' }}>
                                    Batting Order
                                </h3>
                                <div className="space-y-1">
                                    {battingOrder.map((id, idx) => {
                                        const p = myTeam?.squad.find(s => s.player.id === id);
                                        if (!p) return null;
                                        return (
                                            <div key={id} className="flex items-center gap-2 py-2 px-3 rounded-lg" style={{
                                                background: 'rgba(255,255,255,0.03)',
                                                border: '1px solid rgba(255,255,255,0.05)',
                                            }}>
                                                <span className="text-xs font-bold w-6 text-center" style={{ color: 'var(--color-gold)' }}>
                                                    #{idx + 1}
                                                </span>
                                                <span className="flex-1 text-sm font-medium truncate">
                                                    {p.player.name}
                                                    {p.player.id === captainId && <span className="ml-1 text-[10px] text-yellow-400">(C)</span>}
                                                    {p.player.id === wkId && <span className="ml-1 text-[10px] text-orange-400">(WK)</span>}
                                                </span>
                                                <span className="text-[10px]" style={{ color: roleColors[p.player.role] }}>
                                                    {roleEmoji[p.player.role]}
                                                </span>
                                                {!locked && (
                                                    <div className="flex flex-col gap-0.5">
                                                        <button onClick={(e) => { e.stopPropagation(); handleMoveUp(id); }}
                                                            className="text-[10px] w-5 h-4 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center">
                                                            ▲
                                                        </button>
                                                        <button onClick={(e) => { e.stopPropagation(); handleMoveDown(id); }}
                                                            className="text-[10px] w-5 h-4 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center">
                                                            ▼
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Lock / Start buttons */}
                        <div className="space-y-3">
                            {!locked ? (
                                <button
                                    onClick={handleLock}
                                    disabled={selectedIds.length !== 11}
                                    className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    🔒 Lock Playing 11
                                </button>
                            ) : (
                                <>
                                    <div className="text-center text-sm p-3 rounded-xl" style={{
                                        background: 'rgba(34,197,94,0.1)',
                                        border: '1px solid rgba(34,197,94,0.3)',
                                        color: 'var(--color-success)',
                                    }}>
                                        ✅ Your Playing 11 is locked!
                                    </div>
                                    {opponentTeam && !opponentLocked && (
                                        <div className="text-center text-xs p-2 rounded-lg" style={{
                                            background: 'rgba(255,193,7,0.1)',
                                            color: 'var(--color-gold)',
                                        }}>
                                            ⏳ Waiting for {opponentTeam.teamName} to lock their selection...
                                        </div>
                                    )}
                                    {(!opponentTeam || opponentLocked) && (
                                        <button onClick={handleStartMatch} className="btn-primary w-full" style={{ animation: 'pulse 2s infinite' }}>
                                            🏏 Start Match →
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
