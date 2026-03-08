'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useUserStore } from '@/lib/store';
import Navbar from '@/components/Navbar';
import PlayerAvatar from '@/components/PlayerAvatar';
import { IPL_TEAMS } from '@/data/teams';

// Hardcoding these constants on the client avoid importing lib/retentionEngine which requires node dependencies (redis)
const RETENTION_COSTS = [16, 12, 8, 6];
const MAX_RETENTIONS = 4;
const MAX_OVERSEAS_RETENTIONS = 2;

// ─── Types ────────────────────────────────────────────────────────────────────
interface RetainedPlayer {
    playerId: string;
    playerName: string;
    role: string;
    nationality: 'Indian' | 'Overseas';
    slot: number;
    cost: number;
}

interface RetentionTeamState {
    userId: string;
    username: string;
    teamName: string;
    teamId?: string;
    purse: number;
    retained: RetainedPlayer[];
    confirmed: boolean;
}

interface RetentionState {
    roomCode: string;
    teams: RetentionTeamState[];
    timerEnd: number;
    allConfirmed: boolean;
}

interface EligiblePlayer {
    name: string;
    role: string;
    nationality: 'Indian' | 'Overseas';
    auctionPrice2025: number;
    capStatus: 'Capped' | 'Uncapped';
    playerId: string | null;
    battingSkill: number;
    bowlingSkill: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(ms: number) {
    if (ms <= 0) return '0:00';
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function getRoleBadgeColor(role: string) {
    switch (role) {
        case 'BATSMAN': return '#4FC3F7';
        case 'BOWLER': return '#EF5350';
        case 'ALL_ROUNDER': return '#66BB6A';
        case 'WICKET_KEEPER': return '#FFA726';
        default: return 'var(--color-text-muted)';
    }
}

function getRoleLabel(role: string) {
    return role.replace('_', '-');
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function RetentionPage() {
    const params = useParams();
    const code = params.code as string;
    const router = useRouter();
    const { userId, isLoggedIn, setUser } = useUserStore();

    const [loading, setLoading] = useState(true);
    const [hostId, setHostId] = useState<string | null>(null);
    const [state, setState] = useState<RetentionState | null>(null);
    const [eligiblePool, setEligiblePool] = useState<EligiblePlayer[]>([]);
    const [timeLeft, setTimeLeft] = useState(0);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState('');
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const myTeam = state?.teams.find(t => t.userId === userId);

    // ── Fetch state ───────────────────────────────────────────────────────────
    const fetchState = useCallback(async () => {
        try {
            const res = await fetch(`/api/retention?roomCode=${code}`);
            if (res.ok) {
                const data = await res.json();
                setState(data.state);
                if (data.eligiblePool) setEligiblePool(data.eligiblePool);

                // If all confirmed and allConfirmed → host sees proceed button; non-host poll for auction
                if (data.state?.allConfirmed) {
                    const roomRes = await fetch(`/api/rooms/${code}`);
                    if (roomRes.ok) {
                        const roomData = await roomRes.json();
                        if (roomData.room.status === 'auction') {
                            router.push(`/auction/${code}`);
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Failed to fetch retention state:', err);
        }
    }, [code, router]);

    // ── Init ──────────────────────────────────────────────────────────────────
    useEffect(() => {
        const init = async () => {
            if (!isLoggedIn) {
                try {
                    const res = await fetch('/api/auth/me');
                    if (res.ok) {
                        const data = await res.json();
                        setUser(data.userId, data.username);
                    } else { router.push('/login'); return; }
                } catch { router.push('/login'); return; }
            }

            const roomRes = await fetch(`/api/rooms/${code}`);
            if (roomRes.ok) {
                const roomData = await roomRes.json();
                setHostId(roomData.room.hostId);
            }

            await fetchState();
            setLoading(false);
        };
        init();

        const poll = setInterval(fetchState, 2000);
        return () => clearInterval(poll);
    }, [isLoggedIn, code, router, setUser, fetchState]);

    // ── Timer countdown ───────────────────────────────────────────────────────
    useEffect(() => {
        if (!state?.timerEnd) return;
        if (timerRef.current) clearInterval(timerRef.current);

        timerRef.current = setInterval(() => {
            setTimeLeft(Math.max(0, state.timerEnd - Date.now()));
        }, 500);

        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [state?.timerEnd]);

    // ── Actions ───────────────────────────────────────────────────────────────
    const handleRetain = async (playerName: string) => {
        setActionLoading(playerName);
        setErrorMsg('');
        try {
            const res = await fetch('/api/retention', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'retain', roomCode: code, playerName }),
            });
            const data = await res.json();
            if (!res.ok) { setErrorMsg(data.error || 'Failed to retain player'); return; }
            setState(data.state);
        } catch { setErrorMsg('Network error'); }
        finally { setActionLoading(null); }
    };

    const handleRelease = async (playerId: string) => {
        setActionLoading('release-' + playerId);
        setErrorMsg('');
        try {
            const res = await fetch('/api/retention', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'release', roomCode: code, playerId }),
            });
            const data = await res.json();
            if (!res.ok) { setErrorMsg(data.error || 'Failed to release player'); return; }
            setState(data.state);
        } catch { setErrorMsg('Network error'); }
        finally { setActionLoading(null); }
    };

    const handleClearAll = async () => {
        if (!myTeam) return;
        for (const r of [...myTeam.retained]) {
            await handleRelease(r.playerId);
        }
    };

    const handleConfirm = async () => {
        setActionLoading('confirm');
        setErrorMsg('');
        try {
            const res = await fetch('/api/retention', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'confirm', roomCode: code }),
            });
            const data = await res.json();
            if (!res.ok) { setErrorMsg(data.error || 'Failed to confirm'); return; }
            setState(data.state);
        } catch { setErrorMsg('Network error'); }
        finally { setActionLoading(null); }
    };

    const handleProceed = async () => {
        setActionLoading('proceed');
        setErrorMsg('');
        try {
            const res = await fetch('/api/retention', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'proceed', roomCode: code }),
            });
            const data = await res.json();
            if (!res.ok) { setErrorMsg(data.error || 'Failed to proceed'); return; }
            router.push(`/auction/${code}`);
        } catch { setErrorMsg('Network error'); }
        finally { setActionLoading(null); }
    };

    // ── Computed ──────────────────────────────────────────────────────────────
    const isHost = hostId === userId;
    const myOverseasCount = myTeam?.retained.filter(r => r.nationality === 'Overseas').length ?? 0;
    const nextSlot = (myTeam?.retained.length ?? 0) + 1;
    const nextCost = nextSlot <= MAX_RETENTIONS ? RETENTION_COSTS[nextSlot - 1] : 0;
    const isTimerExpired = timeLeft === 0 && (state?.timerEnd ?? 0) > 0 && Date.now() > (state?.timerEnd ?? 0);
    const timerWarning = timeLeft > 0 && timeLeft < 30000;

    const isRetained = (name: string) => myTeam?.retained.some(r => r.playerName === name) ?? false;

    const canRetain = (p: EligiblePlayer): { ok: boolean; reason?: string } => {
        if (myTeam?.confirmed) return { ok: false, reason: 'Already confirmed' };
        if (isTimerExpired) return { ok: false, reason: 'Timer expired' };
        if (isRetained(p.name)) return { ok: false, reason: 'Already retained' };
        if ((myTeam?.retained.length ?? 0) >= MAX_RETENTIONS) return { ok: false, reason: 'Max 4 reached' };
        if (p.nationality === 'Overseas' && myOverseasCount >= MAX_OVERSEAS_RETENTIONS) return { ok: false, reason: 'Max 2 overseas reached' };
        if ((myTeam?.purse ?? 0) < nextCost) return { ok: false, reason: 'Insufficient purse' };
        return { ok: true };
    };

    // ── Loading & Error ──────────────────────────────────────────────────────
    if (loading && !state) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-6" style={{ background: 'var(--color-bg-primary)' }}>
                <div className="shimmer w-16 h-16 rounded-2xl" />
                <div className="text-center">
                    <p className="gold-text font-black tracking-widest text-xs mb-2">INITIALIZING ARENA</p>
                    <p className="text-[10px] text-[var(--color-text-muted)] animate-pulse">Syncing squad data and initializing bots...</p>
                </div>
            </div>
        );
    }

    if (!state) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-8 px-6" style={{ background: 'var(--color-bg-primary)' }}>
                <div className="text-center max-w-md">
                    <div className="w-20 h-20 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                        <span className="text-3xl">⚠️</span>
                    </div>
                    <h1 className="text-2xl font-black text-white mb-3">Phase Sync Error</h1>
                    <p className="text-sm leading-relaxed mb-8" style={{ color: 'var(--color-text-muted)' }}>
                        We couldn't retrieve the retention state for room <span className="gold-text font-mono font-bold">{code}</span>.
                        This usually happens if the session expired or the host hasn't finished initializing the room.
                    </p>
                    <div className="flex flex-col gap-3">
                        <button
                            onClick={() => window.location.reload()}
                            className="btn-primary py-4 px-8 w-full font-bold"
                        >
                            🔄 Retry Connection
                        </button>
                        <button
                            onClick={() => router.push('/dashboard')}
                            className="text-xs font-semibold py-2"
                            style={{ color: 'var(--color-text-muted)' }}
                        >
                            Return to Dashboard
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen pb-24" style={{ background: 'var(--color-bg-primary)' }}>
            <Navbar />

            <main className="max-w-7xl mx-auto px-4 pt-24">
                {/* ── Header ── */}
                <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <span className="badge badge-gold text-xs">RETENTION PHASE</span>
                            <span className="font-mono text-sm gold-text">{code}</span>
                        </div>
                        <h1 className="text-2xl font-black text-white">Pre-Auction Retention</h1>
                        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                            Retain up to 4 players from your previous squad · Max 2 overseas
                        </p>
                    </div>

                    {/* Timer */}
                    <div className="panel px-5 py-3 text-center" style={{
                        borderColor: timerWarning ? 'var(--color-danger)' : 'var(--color-border)',
                        background: timerWarning ? 'rgba(239,83,80,0.05)' : undefined,
                    }}>
                        <p className="text-[10px] font-semibold tracking-wider uppercase mb-1" style={{ color: 'var(--color-text-muted)' }}>
                            {isTimerExpired ? 'Time Expired' : 'Time Remaining'}
                        </p>
                        <p className={`text-2xl font-black font-mono ${timerWarning ? 'text-red-400' : 'gold-text'}`}>
                            {isTimerExpired ? '0:00' : formatTime(timeLeft)}
                        </p>
                    </div>
                </div>

                {/* Error */}
                {errorMsg && (
                    <div className="mb-4 px-4 py-3 rounded-xl text-sm font-medium" style={{ background: 'rgba(239,83,80,0.1)', border: '1px solid rgba(239,83,80,0.3)', color: '#EF5350' }}>
                        ⚠ {errorMsg}
                    </div>
                )}

                <div className="grid lg:grid-cols-3 gap-6">
                    {/* ── Left: Eligible Pool ── */}
                    <div className="lg:col-span-2">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-sm font-semibold tracking-wider uppercase" style={{ color: 'var(--color-text-muted)' }}>
                                {myTeam?.teamName || 'Your Squad'} — Retention Pool
                            </h2>
                            <span className="text-xs px-2 py-1 rounded-lg font-mono" style={{ background: 'var(--color-bg-elevated)', color: 'var(--color-text-muted)' }}>
                                {eligiblePool.length} eligible
                            </span>
                        </div>

                        {eligiblePool.length === 0 ? (
                            <div className="panel text-center py-12">
                                <p style={{ color: 'var(--color-text-muted)' }}>
                                    No retention pool found for your team.
                                    <br /><span className="text-xs">Make sure you selected an IPL team in the room.</span>
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {eligiblePool.map((player) => {
                                    const retained = isRetained(player.name);
                                    const { ok: canDo, reason } = canRetain(player);
                                    const retainedData = myTeam?.retained.find(r => r.playerName === player.name);
                                    const roleColor = getRoleBadgeColor(player.role);
                                    const isLoading = actionLoading === player.name;

                                    return (
                                        <div
                                            key={player.name}
                                            className="panel relative overflow-hidden transition-all duration-300"
                                            style={{
                                                borderColor: retained ? 'var(--color-gold)' : 'var(--color-border)',
                                                background: retained ? 'rgba(212,175,55,0.05)' : 'var(--color-bg-primary)',
                                                opacity: (!canDo && !retained) ? 0.6 : 1,
                                            }}
                                        >
                                            {/* Slot badge if retained */}
                                            {retained && retainedData && (
                                                <div className="absolute top-3 right-3 flex items-center gap-1">
                                                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'var(--color-gold)', color: 'var(--color-bg-primary)' }}>
                                                        SLOT {retainedData.slot} · ₹{retainedData.cost} Cr
                                                    </span>
                                                </div>
                                            )}

                                            <div className="flex items-center gap-3 mb-3">
                                                <PlayerAvatar
                                                    role={player.role as 'BATSMAN' | 'BOWLER' | 'ALL_ROUNDER' | 'WICKET_KEEPER'}
                                                    name={player.name}
                                                    size="md"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-bold text-sm text-white truncate pr-20">{player.name}</h4>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: `${roleColor}20`, color: roleColor }}>
                                                            {getRoleLabel(player.role)}
                                                        </span>
                                                        <span className="text-[10px]" style={{ color: player.nationality === 'Indian' ? '#66BB6A' : '#4FC3F7' }}>
                                                            {player.nationality === 'Indian' ? '🇮🇳' : '🌍'} {player.nationality}
                                                        </span>
                                                        {player.capStatus === 'Capped' && (
                                                            <span className="text-[10px]" style={{ color: 'var(--color-gold)' }}>⭐ Capped</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Skills */}
                                            <div className="grid grid-cols-2 gap-2 mb-3">
                                                <div>
                                                    <div className="flex justify-between text-[10px] mb-0.5">
                                                        <span style={{ color: 'var(--color-text-muted)' }}>BAT</span>
                                                        <span className="font-mono">{player.battingSkill}</span>
                                                    </div>
                                                    <div className="h-1 rounded-full" style={{ background: 'var(--color-border)' }}>
                                                        <div className="h-full rounded-full" style={{ width: `${player.battingSkill}%`, background: '#4FC3F7' }} />
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="flex justify-between text-[10px] mb-0.5">
                                                        <span style={{ color: 'var(--color-text-muted)' }}>BOWL</span>
                                                        <span className="font-mono">{player.bowlingSkill}</span>
                                                    </div>
                                                    <div className="h-1 rounded-full" style={{ background: 'var(--color-border)' }}>
                                                        <div className="h-full rounded-full" style={{ width: `${player.bowlingSkill}%`, background: '#EF5350' }} />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 2025 price */}
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                                                    2025 price: <span className="font-bold" style={{ color: 'var(--color-text-secondary)' }}>₹{player.auctionPrice2025} Cr</span>
                                                </span>

                                                {myTeam?.confirmed ? null : retained ? (
                                                    <button
                                                        onClick={() => retainedData && handleRelease(retainedData.playerId)}
                                                        disabled={!!actionLoading}
                                                        className="text-[11px] px-3 py-1 rounded-lg font-semibold transition-all"
                                                        style={{ background: 'rgba(239,83,80,0.1)', color: '#EF5350', border: '1px solid rgba(239,83,80,0.3)' }}
                                                    >
                                                        ✕ Release
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => handleRetain(player.name)}
                                                        disabled={!canDo || isLoading}
                                                        title={reason}
                                                        className="text-[11px] px-3 py-1 rounded-lg font-semibold transition-all"
                                                        style={{
                                                            background: canDo ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.05)',
                                                            color: canDo ? 'var(--color-gold)' : 'var(--color-text-muted)',
                                                            border: canDo ? '1px solid rgba(212,175,55,0.3)' : '1px solid transparent',
                                                            cursor: canDo ? 'pointer' : 'not-allowed',
                                                        }}
                                                    >
                                                        {isLoading ? '...' : `+ Retain (₹${nextCost} Cr)`}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* ── Right Sidebar ── */}
                    <div className="space-y-4">
                        {/* My Retention Summary */}
                        <div className="panel-gold">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-bold text-white">My Retentions</h3>
                                <span className="text-xs font-bold gold-text">{myTeam?.retained.length ?? 0}/{MAX_RETENTIONS}</span>
                            </div>

                            {/* Purse */}
                            <div className="mb-4 p-3 rounded-xl" style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)' }}>
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Auction Purse After Retention</span>
                                </div>
                                <p className="text-xl font-black gold-text">₹{myTeam?.purse ?? 100} Cr</p>
                                <div className="h-1.5 rounded-full mt-2" style={{ background: 'var(--color-border)' }}>
                                    <div className="h-full rounded-full transition-all duration-500" style={{
                                        width: `${((myTeam?.purse ?? 100) / 100) * 100}%`,
                                        background: (myTeam?.purse ?? 100) < 60
                                            ? 'var(--color-danger)'
                                            : 'linear-gradient(90deg, var(--color-gold), var(--color-gold-light))',
                                    }} />
                                </div>

                                {/* Slot cost preview */}
                                {!myTeam?.confirmed && (myTeam?.retained.length ?? 0) < MAX_RETENTIONS && (
                                    <p className="text-[10px] mt-2" style={{ color: 'var(--color-text-muted)' }}>
                                        Next retention (slot {nextSlot}) costs <span className="font-bold" style={{ color: 'var(--color-gold)' }}>₹{nextCost} Cr</span>
                                    </p>
                                )}
                            </div>

                            {/* Overseas counter */}
                            <div className="flex items-center justify-between text-xs mb-4 px-1">
                                <span style={{ color: 'var(--color-text-muted)' }}>Overseas retained</span>
                                <span className={myOverseasCount >= MAX_OVERSEAS_RETENTIONS ? 'text-orange-400 font-bold' : 'text-white font-bold'}>
                                    {myOverseasCount}/{MAX_OVERSEAS_RETENTIONS}
                                </span>
                            </div>

                            {/* Retained list */}
                            {(myTeam?.retained.length ?? 0) === 0 ? (
                                <p className="text-[11px] text-center py-4" style={{ color: 'var(--color-text-muted)' }}>
                                    No players retained yet
                                </p>
                            ) : (
                                <div className="space-y-2 mb-4">
                                    {myTeam!.retained.map((r) => (
                                        <div key={r.playerId} className="flex items-center justify-between p-2 rounded-lg"
                                            style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.2)' }}>
                                            <div>
                                                <p className="text-xs font-bold text-white">{r.playerName}</p>
                                                <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                                                    Slot {r.slot} · {r.nationality === 'Indian' ? '🇮🇳' : '🌍'}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold gold-text">₹{r.cost} Cr</span>
                                                {!myTeam?.confirmed && (
                                                    <button onClick={() => handleRelease(r.playerId)}
                                                        disabled={!!actionLoading}
                                                        className="text-[10px] w-5 h-5 rounded-full flex items-center justify-center transition-colors"
                                                        style={{ background: 'rgba(239,83,80,0.15)', color: '#EF5350' }}>
                                                        ✕
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Action buttons */}
                            {!myTeam?.confirmed ? (
                                <div className="space-y-2">
                                    {(myTeam?.retained.length ?? 0) > 0 && (
                                        <button
                                            onClick={handleClearAll}
                                            disabled={!!actionLoading}
                                            className="w-full py-2 rounded-xl text-xs font-semibold transition-all"
                                            style={{ background: 'rgba(239,83,80,0.08)', color: '#EF5350', border: '1px solid rgba(239,83,80,0.2)' }}
                                        >
                                            Clear All
                                        </button>
                                    )}
                                    <button
                                        id="confirm-retentions-btn"
                                        onClick={handleConfirm}
                                        disabled={actionLoading === 'confirm'}
                                        className="w-full btn-primary py-3"
                                    >
                                        {actionLoading === 'confirm' ? 'Confirming...' : '🔒 Confirm Retentions'}
                                    </button>
                                </div>
                            ) : (
                                <div className="text-center py-2">
                                    <span className="text-sm font-bold" style={{ color: '#66BB6A' }}>✓ Retentions Confirmed</span>
                                </div>
                            )}
                        </div>

                        {/* Slot cost table */}
                        <div className="panel">
                            <h3 className="text-xs font-semibold tracking-wider uppercase mb-3" style={{ color: 'var(--color-text-muted)' }}>
                                Retention Costs
                            </h3>
                            <div className="space-y-2">
                                {RETENTION_COSTS.map((cost, i) => (
                                    <div key={i} className="flex justify-between items-center text-xs py-1 px-2 rounded-lg" style={{
                                        background: (myTeam?.retained.length ?? 0) > i
                                            ? 'rgba(212,175,55,0.08)'
                                            : (myTeam?.retained.length ?? 0) === i
                                                ? 'rgba(255,255,255,0.04)'
                                                : 'transparent',
                                    }}>
                                        <span style={{ color: 'var(--color-text-secondary)' }}>
                                            {i + 1}{i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'} player
                                        </span>
                                        <span className="font-bold font-mono" style={{
                                            color: (myTeam?.retained.length ?? 0) > i ? 'var(--color-gold)' : 'var(--color-text-primary)',
                                        }}>
                                            {(myTeam?.retained.length ?? 0) > i ? '✓ ' : ''}₹{cost} Cr
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* All Teams Status */}
                        <div className="panel">
                            <h3 className="text-xs font-semibold tracking-wider uppercase mb-3" style={{ color: 'var(--color-text-muted)' }}>
                                All Teams
                            </h3>
                            <div className="space-y-2">
                                {state.teams.map(team => {
                                    const iplTeam = IPL_TEAMS.find(t => t.name === team.teamName || t.id === team.teamId);
                                    const teamColor = iplTeam?.color || 'var(--color-gold)';
                                    const overseasRetained = team.retained.filter(r => r.nationality === 'Overseas').length;

                                    return (
                                        <div key={team.userId} className="p-3 rounded-xl transition-all" style={{
                                            background: team.userId === userId ? 'rgba(212,175,55,0.04)' : 'var(--color-bg-primary)',
                                            border: `1px solid ${team.confirmed ? '#66BB6A40' : 'var(--color-border)'}`,
                                            borderLeft: `3px solid ${team.confirmed ? '#66BB6A' : teamColor}`,
                                        }}>
                                            <div className="flex items-center justify-between mb-1">
                                                <div className="flex items-center gap-2">
                                                    {iplTeam && <span className="text-sm">{iplTeam.emoji}</span>}
                                                    <div>
                                                        <p className="text-xs font-bold" style={{ color: teamColor }}>
                                                            {iplTeam?.shortName || team.teamName}
                                                        </p>
                                                        <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{team.username}</p>
                                                    </div>
                                                </div>
                                                {team.confirmed ? (
                                                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(102,187,106,0.15)', color: '#66BB6A' }}>
                                                        LOCKED ✓
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-muted)' }}>
                                                        {team.retained.length}/4
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                                                <span>🌍 {overseasRetained}/2</span>
                                                <span>₹{team.purse} Cr left</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Host: Proceed to Auction */}
                        {isHost && state.allConfirmed && (
                            <button
                                id="proceed-to-auction-btn"
                                onClick={handleProceed}
                                disabled={actionLoading === 'proceed'}
                                className="w-full btn-primary py-4 text-base font-black"
                                style={{ animation: 'pulse 2s infinite' }}
                            >
                                {actionLoading === 'proceed' ? 'Starting...' : '🏏 Proceed to Mega Auction →'}
                            </button>
                        )}

                        {/* Non-host: waiting message */}
                        {!isHost && state.allConfirmed && (
                            <div className="panel text-center py-4">
                                <div className="animate-pulse-gold inline-block w-2 h-2 rounded-full mb-2" style={{ background: 'var(--color-gold)' }} />
                                <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                                    Waiting for host to start the Mega Auction...
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
