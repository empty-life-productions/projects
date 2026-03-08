'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/lib/store';
import Navbar from '@/components/Navbar';
import RoomCard from '@/components/RoomCard';

interface UserRoom {
    code: string;
    status: string;
    playerCount: number;
    maxPlayers: number;
    hostId: string;
    players: string[];
    createdAt: string;
}

export default function DashboardPage() {
    const { userId, username, isLoggedIn, setUser } = useUserStore();
    const [rooms, setRooms] = useState<UserRoom[]>([]);
    const [joinCode, setJoinCode] = useState('');
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [joining, setJoining] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();

    useEffect(() => {
        const checkAuth = async () => {
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
            fetchRooms();
        };
        checkAuth();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchRooms = async () => {
        try {
            const res = await fetch('/api/rooms');
            if (res.ok) {
                const data = await res.json();
                setRooms(data.rooms || []);
            }
        } catch (err) {
            console.error('Failed to fetch rooms:', err);
        } finally {
            setLoading(false);
        }
    };

    const createRoom = async () => {
        setCreating(true);
        setError('');
        try {
            const res = await fetch('/api/rooms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'create' }),
            });
            const data = await res.json();
            if (res.ok) {
                router.push(`/room/${data.room.code}`);
            } else {
                setError(data.error);
            }
        } catch {
            setError('Failed to create room');
        } finally {
            setCreating(false);
        }
    };

    const deleteRoom = async (code: string) => {
        if (!confirm(`Are you sure you want to destroy room ${code}? This will purge all session data.`)) return;

        try {
            const res = await fetch(`/api/rooms/${code}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                setRooms(rooms.filter(r => r.code !== code));
            } else {
                const data = await res.json();
                setError(data.error || 'Failed to delete room');
            }
        } catch {
            setError('Failed to delete room');
        }
    };

    const handleJoinRoom = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!joinCode.trim()) return;
        setJoining(true);
        setError('');
        try {
            const res = await fetch('/api/rooms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'join', code: joinCode.toUpperCase() }),
            });
            const data = await res.json();
            if (res.ok) {
                router.push(`/room/${data.room.code}`);
            } else {
                setError(data.error);
            }
        } catch {
            setError('Failed to join room');
        } finally {
            setJoining(false);
        }
    };

    const navigateToRoom = (code: string) => {
        const room = rooms.find(r => r.code === code);
        if (!room) return;
        if (room.status === 'auction') router.push(`/auction/${code}`);
        else if (room.status === 'selection') router.push(`/selection/${code}`);
        else if (room.status === 'league') router.push(`/league/${code}`);
        else if (room.status === 'match') router.push(`/match/${code}`);
        else router.push(`/room/${code}`);
    };

    if (loading || !isLoggedIn) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-primary)' }}>
                <div className="shimmer w-16 h-16 rounded-2xl" />
            </div>
        );
    }

    return (
        <div className="min-h-screen" style={{ background: 'var(--color-bg-primary)' }}>
            <Navbar />

            {/* Ambient Background */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-30">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[var(--color-gold)] blur-[150px] opacity-10 -translate-y-1/2 translate-x-1/2" />
            </div>

            <main className="relative z-10 max-w-7xl mx-auto px-6 pt-24 pb-20">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 animate-fadeInUp">
                    <div>
                        <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full bg-[var(--color-gold)]/5 border border-[var(--color-gold)]/20">
                            <span className="text-[10px] font-black tracking-widest gold-text uppercase">Commander Dashboard</span>
                        </div>
                        <h1 className="text-4xl font-black tracking-tight mb-2">
                            Welcome, <span className="gold-text uppercase">{username}</span>
                        </h1>
                        <p className="text-sm font-medium text-[var(--color-text-muted)] max-w-md">
                            Your tactical control center for Season 2026. Manage your rooms and monitor active campaigns.
                        </p>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block px-6 py-2 border-r border-white/5">
                            <div className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-1">Active Rooms</div>
                            <div className="text-xl font-black text-white">{rooms.length}</div>
                        </div>
                        <button
                            id="create-room-btn"
                            onClick={createRoom}
                            disabled={creating}
                            className="btn-primary"
                        >
                            {creating ? 'Initializing...' : 'Deploy New Room'}
                        </button>
                    </div>
                </div>

                <div className="grid lg:grid-cols-3 gap-8">
                    {/* Left Column: Rooms & Join */}
                    <div className="lg:col-span-2 space-y-8">
                        {/* Quick Join */}
                        <div className="panel-gold group border-white/10 overflow-hidden">
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-6 p-2">
                                <div className="flex-1">
                                    <h2 className="text-lg font-black mb-1 tracking-tight">Rapid Deployment</h2>
                                    <p className="text-xs font-medium text-[var(--color-text-secondary)]">Enter a 6-digit access code to join an active simulation.</p>
                                </div>
                                <form onSubmit={handleJoinRoom} className="flex w-full sm:w-auto gap-3">
                                    <input
                                        id="join-code-input"
                                        type="text"
                                        value={joinCode}
                                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                                        placeholder="ROOM CODE"
                                        className="input-field font-mono font-black tracking-[0.3em] text-center w-40"
                                        maxLength={6}
                                    />
                                    <button
                                        id="join-room-btn"
                                        type="submit"
                                        disabled={joining || joinCode.length < 6}
                                        className="btn-secondary min-w-[100px]"
                                    >
                                        {joining ? '...' : 'JOIN'}
                                    </button>
                                </form>
                            </div>
                        </div>

                        {error && (
                            <div className="px-5 py-4 rounded-xl text-sm font-bold flex items-center gap-3 animate-slideIn" style={{
                                background: 'rgba(239, 68, 68, 0.08)', color: 'var(--color-danger)',
                                border: '1px solid rgba(239, 68, 68, 0.2)',
                            }}>
                                <span className="text-lg">⚠️</span> {error}
                            </div>
                        )}

                        {/* Room List */}
                        <div>
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xs font-black tracking-[0.3em] uppercase gold-text">
                                    Operation Status
                                </h2>
                                <div className="h-px flex-1 mx-6 bg-gradient-to-r from-[var(--color-gold)]/20 to-transparent" />
                            </div>

                            {rooms.length === 0 ? (
                                <div className="panel text-center py-20 bg-white/[0.02]">
                                    <div className="text-4xl mb-4 opacity-20">📡</div>
                                    <p className="text-sm font-medium text-[var(--color-text-muted)]">
                                        No active operations detected in your sector.
                                    </p>
                                </div>
                            ) : (
                                <div className="grid md:grid-cols-2 gap-4">
                                    {rooms.map((room) => (
                                        <div key={room.code} onClick={() => navigateToRoom(room.code)} className="cursor-pointer group">
                                            <RoomCard
                                                code={room.code}
                                                status={room.status}
                                                playerCount={room.playerCount}
                                                maxPlayers={room.maxPlayers}
                                                players={room.players}
                                                hostId={room.hostId}
                                                currentUserId={userId || ''}
                                                onJoin={navigateToRoom}
                                                onDelete={deleteRoom}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Column: Sidebar */}
                    <div className="space-y-8">
                        {/* Summary Widget */}
                        <div className="panel bg-[#0F0F12] border-white/5">
                            <h3 className="text-[10px] font-black tracking-[0.3em] uppercase text-[var(--color-text-muted)] mb-6">Simulation Intel</h3>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center py-3 border-b border-white/[0.03]">
                                    <span className="text-xs font-bold text-[var(--color-text-secondary)]">Engine Version</span>
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-white">v2.1.0-gold</span>
                                </div>
                                <div className="flex justify-between items-center py-3 border-b border-white/[0.03]">
                                    <span className="text-xs font-bold text-[var(--color-text-secondary)]">Tournament Purge</span>
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-white">120.00 Cr</span>
                                </div>
                                <div className="flex justify-between items-center py-3 border-b border-white/[0.03]">
                                    <span className="text-xs font-bold text-[var(--color-text-secondary)]">Market Status</span>
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Active</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Activity Log */}
                        <div className="panel bg-[#0F0F12] border-white/5">
                            <h3 className="text-[10px] font-black tracking-[0.3em] uppercase text-[var(--color-text-muted)] mb-6">Activity Logs</h3>
                            <div className="space-y-6">
                                {[
                                    { t: 'Retention pool generated', d: 'Success', s: 'emerald' },
                                    { t: 'Database sync', d: 'Stable', s: 'emerald' },
                                    { t: 'Render cloud link', d: 'Pending', s: 'amber' },
                                ].map((log, i) => (
                                    <div key={i} className="flex gap-4">
                                        <div className={`w-1 h-8 rounded-full bg-${log.s}-500/20`} />
                                        <div>
                                            <div className="text-[11px] font-black text-white leading-tight uppercase tracking-wide">{log.t}</div>
                                            <div className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase mt-1 tracking-widest">{log.d}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
