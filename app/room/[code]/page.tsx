'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useUserStore } from '@/lib/store';
import Navbar from '@/components/Navbar';
import TeamSelector from '@/components/TeamSelector';
import { IPL_TEAMS } from '@/data/teams';
import type { IPLTeam } from '@/data/teams';

interface RoomState {
    code: string;
    hostId: string;
    status: string;
    players: { userId: string; username: string; teamName?: string; teamId?: string }[];
    maxPlayers: number;
}

export default function RoomPage() {
    const params = useParams();
    const code = params.code as string;
    const router = useRouter();
    const { userId, isLoggedIn, setUser } = useUserStore();
    const [room, setRoom] = useState<RoomState | null>(null);
    const [loading, setLoading] = useState(true);
    const [starting, setStarting] = useState(false);
    const [addingBots, setAddingBots] = useState(false);

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
            fetchRoom();
        };
        init();
        const interval = setInterval(fetchRoom, 3000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchRoom = async () => {
        try {
            const res = await fetch(`/api/rooms/${code}`);
            if (res.ok) {
                const data = await res.json();
                setRoom(data.room);
                if (data.room.status === 'retention') router.push(`/retention/${code}`);
                if (data.room.status === 'auction') router.push(`/auction/${code}`);
                if (data.room.status === 'match') router.push(`/match/${code}`);
            }
        } catch (err) {
            console.error('Failed to fetch room:', err);
        } finally {
            setLoading(false);
        }
    };

    const startRetention = async () => {
        setStarting(true);
        try {
            await fetch('/api/retention', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'init', roomCode: code }),
            });
            router.push(`/retention/${code}`);
        } catch (err) {
            console.error('Failed to start retention:', err);
        } finally {
            setStarting(false);
        }
    };

    const startAuction = async () => {
        setStarting(true);
        try {
            await fetch(`/api/rooms/${code}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'auction' }),
            });
            await fetch('/api/auction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'init', roomCode: code }),
            });
            router.push(`/auction/${code}`);
        } catch (err) {
            console.error('Failed to start auction:', err);
        } finally {
            setStarting(false);
        }
    };

    const addBots = async () => {
        setAddingBots(true);
        try {
            const res = await fetch(`/api/rooms/${code}/bots`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ count: 2 }),
            });
            if (res.ok) {
                const data = await res.json();
                setRoom(data.room);
            }
        } catch (err) {
            console.error('Failed to add bots:', err);
        } finally {
            setAddingBots(false);
        }
    };

    const selectTeam = async (team: IPLTeam) => {
        try {
            const res = await fetch(`/api/rooms/${code}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'selectTeam', teamId: team.id, teamName: team.name }),
            });
            if (res.ok) {
                const data = await res.json();
                setRoom(data.room);
            }
        } catch (err) {
            console.error('Failed to select team:', err);
        }
    };

    const isHost = room?.hostId === userId;
    const currentPlayer = room?.players.find(p => p.userId === userId);
    const takenTeamIds = room?.players.filter(p => p.teamId).map(p => p.teamId!) || [];

    // Find the IPL team for a given team name
    const getTeamForPlayer = (player: { teamName?: string; teamId?: string }) => {
        if (player.teamId) return IPL_TEAMS.find(t => t.id === player.teamId);
        if (player.teamName) return IPL_TEAMS.find(t => t.name === player.teamName);
        return null;
    };

    if (loading || !room) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-primary)' }}>
                <div className="shimmer w-16 h-16 rounded-2xl" />
            </div>
        );
    }

    return (
        <div className="min-h-screen" style={{ background: 'var(--color-bg-primary)' }}>
            <Navbar />
            <main className="max-w-5xl mx-auto px-6 pt-24 pb-12">
                {/* Room Header */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center gap-2 mb-4">
                        <span className="badge badge-gold text-xs">ROOM</span>
                        <span className="text-3xl font-mono font-black tracking-[0.3em] gold-text">{room.code}</span>
                    </div>
                    <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                        Share this code with friends to join • Waiting for players
                    </p>
                </div>

                {/* Team Selection */}
                <div className="mb-8">
                    <TeamSelector
                        selectedTeamId={currentPlayer?.teamId || null}
                        onSelect={selectTeam}
                        takenTeamIds={takenTeamIds}
                    />
                </div>

                {/* Players Grid */}
                <div className="panel-elevated mb-8">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-sm font-semibold tracking-[0.15em] uppercase" style={{ color: 'var(--color-text-secondary)' }}>
                            Players ({room.players.length}/{room.maxPlayers})
                        </h2>
                        <div className="h-1.5 w-32 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                            <div className="h-full rounded-full transition-all duration-500" style={{
                                width: `${(room.players.length / room.maxPlayers) * 100}%`,
                                background: 'linear-gradient(90deg, var(--color-gold), var(--color-gold-light))',
                            }} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {room.players.map((player) => {
                            const team = getTeamForPlayer(player);
                            return (
                                <div key={player.userId} className="relative p-4 rounded-xl text-center transition-all duration-300"
                                    style={{
                                        background: player.userId === userId
                                            ? team ? `${team.color}10` : 'rgba(212, 175, 55, 0.08)'
                                            : 'var(--color-bg-primary)',
                                        border: player.userId === userId
                                            ? `1px solid ${team ? `${team.color}50` : 'rgba(212, 175, 55, 0.3)'}`
                                            : '1px solid var(--color-border)',
                                    }}>
                                    {player.userId === room.hostId && (
                                        <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                                            <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                                                style={{ background: 'var(--color-gold)', color: 'var(--color-bg-primary)', fontSize: '9px' }}>
                                                HOST
                                            </span>
                                        </div>
                                    )}
                                    <div className="w-14 h-14 rounded-full mx-auto mb-2 flex items-center justify-center text-xl font-bold"
                                        style={{
                                            background: team ? `${team.color}20` : 'var(--color-bg-elevated)',
                                            color: team ? team.color : 'var(--color-gold)',
                                            border: `2px solid ${team ? `${team.color}40` : 'transparent'}`,
                                        }}>
                                        {team ? team.emoji : player.username.charAt(0).toUpperCase()}
                                    </div>
                                    <p className="text-sm font-semibold truncate">{player.username}</p>
                                    <p className="text-[10px] mt-1 truncate" style={{
                                        color: team ? team.color : 'var(--color-text-muted)',
                                        fontWeight: team ? 600 : 400,
                                    }}>
                                        {team ? team.shortName : 'No team selected'}
                                    </p>
                                </div>
                            );
                        })}
                        {/* Empty slots */}
                        {Array.from({ length: room.maxPlayers - room.players.length }).map((_, i) => (
                            <div key={`empty-${i}`} className="p-4 rounded-xl text-center border border-dashed"
                                style={{ borderColor: 'var(--color-border)', opacity: 0.4 }}>
                                <div className="w-14 h-14 rounded-full mx-auto mb-2 flex items-center justify-center"
                                    style={{ background: 'var(--color-bg-elevated)' }}>
                                    <span className="text-lg" style={{ color: 'var(--color-text-muted)' }}>?</span>
                                </div>
                                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Waiting...</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Host Controls */}
                {isHost && (
                    <div className="panel-gold text-center">
                        <h3 className="text-sm font-semibold mb-2">Host Controls</h3>
                        <p className="text-xs mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                            Start the retention phase first, then proceed to auction. Minimum 2 players required.
                        </p>
                        <div className="flex items-center justify-center gap-3 flex-wrap">
                            <button
                                id="start-retention-btn"
                                onClick={startRetention}
                                disabled={starting}
                                className="btn-primary px-10 py-4 text-sm font-black"
                            >
                                {starting ? 'INITIATING...' : `🚀 START RETENTION (AUTO-FILL BOTS)`}
                            </button>
                            <button
                                id="skip-retention-btn"
                                onClick={startAuction}
                                disabled={starting}
                                className="btn-secondary px-6 py-4 text-xs opacity-60"
                                title="Skip retention and go straight to the Mega Auction"
                            >
                                SKIP → MEGA AUCTION
                            </button>
                        </div>
                    </div>
                )}

                {!isHost && (
                    <div className="text-center py-8">
                        <div className="animate-pulse-gold inline-block w-3 h-3 rounded-full mb-4"
                            style={{ background: 'var(--color-gold)' }} />
                        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                            Waiting for <span className="font-semibold" style={{ color: 'var(--color-gold)' }}>{room.players.find(p => p.userId === room.hostId)?.username || 'the host'}</span> to start the auction...
                        </p>
                    </div>
                )}

                {/* Copy Code */}
                <div className="mt-8 text-center">
                    <button
                        onClick={() => navigator.clipboard.writeText(room.code)}
                        className="text-xs font-medium px-4 py-2 rounded-lg transition-colors"
                        style={{ color: 'var(--color-text-muted)', background: 'rgba(255,255,255,0.05)' }}
                    >
                        📋 Copy Room Code
                    </button>
                </div>
            </main>
        </div>
    );
}
