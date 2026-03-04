'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useUserStore } from '@/lib/store';
import Navbar from '@/components/Navbar';
import AuctionPanel from '@/components/AuctionPanel';
import PlayerAvatar from '@/components/PlayerAvatar';
import { IPL_TEAMS } from '@/data/teams';

interface AuctionSetInfo {
    id: string;
    name: string;
    shortName: string;
    description: string;
    emoji: string;
    color: string;
    players: { id: string; name: string }[];
}

interface AuctionState {
    roomCode: string;
    status: string;
    currentPlayer: { name: string; role: string; basePrice: number; battingSkill: number; bowlingSkill: number; nationality?: string } | null;
    currentBid: number;
    currentBidder: { userId: string; username: string; teamName: string } | null;
    timerEnd: number | null;
    teams: { userId: string; username: string; teamName: string; teamId?: string; purse: number; squad: { player: { id: string; name: string }; soldPrice: number }[] }[];
    soldPlayers: { player: { name: string; role: string }; soldTo: { username: string; teamName: string }; soldPrice: number }[];
    unsoldPlayers: any[];
    currentPlayerIndex: number;
    remainingPlayers: any[];
    // Slot-based fields
    auctionSets: AuctionSetInfo[];
    currentSetIndex: number;
    currentSetPlayerIndex: number;
    totalPlayers: number;
}

export default function AuctionPage() {
    const params = useParams();
    const code = params.code as string;
    const router = useRouter();
    const { userId, isLoggedIn, setUser } = useUserStore();
    const [auction, setAuction] = useState<AuctionState | null>(null);
    const [loading, setLoading] = useState(true);
    const [hostId, setHostId] = useState<string | null>(null);
    const [isSquadsModalOpen, setIsSquadsModalOpen] = useState(false);
    const [isPlayerSetsModalOpen, setIsPlayerSetsModalOpen] = useState(false);
    const [showSoldPopup, setShowSoldPopup] = useState(false);
    const [lastSale, setLastSale] = useState<{ player: any; bid: number; team: string; status: string } | null>(null);

    const fetchAuction = useCallback(async () => {
        try {
            const res = await fetch(`/api/auction?roomCode=${code}`);
            if (res.ok) {
                const data = await res.json();
                if (data.state) setAuction(data.state);
            }
        } catch (err) {
            console.error('Failed to fetch auction:', err);
        }
    }, [code]);

    // Effect to detect new sales
    useEffect(() => {
        if (auction?.status === 'sold' && auction.soldPlayers.length > 0) {
            const latestSale = auction.soldPlayers[auction.soldPlayers.length - 1];
            setLastSale({
                player: latestSale.player,
                bid: latestSale.soldPrice,
                team: latestSale.soldTo.teamName,
                status: 'sold',
            });
            setShowSoldPopup(true);
            const timer = setTimeout(() => setShowSoldPopup(false), 4000);
            return () => clearTimeout(timer);
        } else if (auction?.status === 'unsold' && auction.unsoldPlayers?.length > 0) {
            // Optional: Show popup for unsold too, but in red
            const latestUnsold = auction.unsoldPlayers[auction.unsoldPlayers.length - 1];
            setLastSale({
                player: latestUnsold,
                bid: 0,
                team: 'Unsold',
                status: 'unsold',
            });
            setShowSoldPopup(true);
            const timer = setTimeout(() => setShowSoldPopup(false), 3000);
            return () => clearTimeout(timer);
        } else {
            setShowSoldPopup(false);
        }
    }, [auction?.status, auction?.soldPlayers?.length, auction?.unsoldPlayers?.length]);

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

            // Get room to check host
            const roomRes = await fetch(`/api/rooms/${code}`);
            if (roomRes.ok) {
                const roomData = await roomRes.json();
                setHostId(roomData.room.hostId);
            }

            await fetchAuction();
            setLoading(false);
        };
        init();
        const interval = setInterval(fetchAuction, 2000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleBid = async (amount: number) => {
        try {
            const res = await fetch('/api/auction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'bid', roomCode: code, amount }),
            });
            const data = await res.json();
            if (data.state) setAuction(data.state);
        } catch (err) {
            console.error('Bid failed:', err);
        }
    };

    const handleNext = async () => {
        try {
            const res = await fetch('/api/auction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'next', roomCode: code }),
            });
            const data = await res.json();
            if (data.state) setAuction(data.state);
        } catch (err) {
            console.error('Next player failed:', err);
        }
    };

    const handleSell = async () => {
        try {
            const res = await fetch('/api/auction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'sell', roomCode: code }),
            });
            const data = await res.json();
            if (data.state) setAuction(data.state);
        } catch (err) {
            console.error('Sell failed:', err);
        }
    };

    const handleSkipPlayer = async () => {
        try {
            const res = await fetch('/api/auction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'skipPlayer', roomCode: code }),
            });
            const data = await res.json();
            if (data.state) setAuction(data.state);
        } catch (err) { console.error(err); }
    };

    const handleSkipSet = async () => {
        if (!confirm('Are you sure you want to skip the rest of this set?')) return;
        try {
            const res = await fetch('/api/auction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'skipSet', roomCode: code }),
            });
            const data = await res.json();
            if (data.state) setAuction(data.state);
        } catch (err) { console.error(err); }
    };

    const handleEndAuction = async () => {
        if (!confirm('Are you absolutely sure you want to stop the auction for everyone?')) return;
        try {
            const res = await fetch('/api/auction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'endAuction', roomCode: code }),
            });
            const data = await res.json();
            if (data.state) setAuction(data.state);
        } catch (err) { console.error(err); }
    };

    const isHost = hostId === userId;
    const userTeam = auction?.teams.find(t => t.userId === userId);
    const canBid = auction?.status === 'bidding' && auction?.currentBidder?.userId !== userId;

    // Get current set info
    const currentSet = auction?.auctionSets?.[auction.currentSetIndex];

    useEffect(() => {
        // Auto-sell when timer expires (host only)
        if (isHost && auction?.timerEnd && auction.status === 'bidding') {
            const remaining = auction.timerEnd - Date.now();
            if (remaining <= 0) {
                handleSell();
            } else {
                const timeout = setTimeout(handleSell, remaining);
                return () => clearTimeout(timeout);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [auction?.timerEnd, isHost, auction?.status]);

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
            <main className="max-w-7xl mx-auto px-6 pt-24 pb-12">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold">Live Auction</h1>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            Room: <span className="font-mono gold-text">{code}</span>
                            {auction && ` • Player ${auction.currentPlayerIndex} of ${auction.totalPlayers || 250}`}
                        </p>
                    </div>
                    {auction?.status === 'completed' && (
                        <button
                            onClick={async () => {
                                try {
                                    // Update room status to 'selection'
                                    await fetch(`/api/rooms/${code}`, {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ status: 'selection' }),
                                    });

                                    // Auto-select playing 11 for bot teams
                                    const botTeams = auction.teams.filter(t => t.userId !== userId);
                                    for (const bot of botTeams) {
                                        const topPlayers = [...bot.squad]
                                            .sort((a, b) => b.soldPrice - a.soldPrice)
                                            .slice(0, 11)
                                            .map(s => s.player.id);

                                        if (topPlayers.length === 11) {
                                            await fetch('/api/selection', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    roomCode: code,
                                                    teamId: bot.userId,
                                                    selectedIds: topPlayers,
                                                }),
                                            });
                                        }
                                    }

                                    router.push(`/selection/${code}`);
                                } catch (err) {
                                    console.error('Failed to transition to selection:', err);
                                    router.push(`/selection/${code}`);
                                }
                            }}
                            className="btn-primary"
                            style={{ animation: 'pulse 2s infinite' }}
                        >
                            Select Playing 11 →
                        </button>
                    )}
                    <button
                        onClick={() => setIsPlayerSetsModalOpen(true)}
                        className="btn-secondary text-xs"
                    >
                        📋 View Player Sets
                    </button>
                </div>

                {/* ── Auction Set Tracker ── */}
                {auction?.auctionSets && auction.auctionSets.length > 0 && (
                    <div className="mb-6 rounded-xl p-4" style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)' }}>
                        {/* Current Set Banner */}
                        {currentSet && (
                            <div className="flex items-center gap-3 mb-4">
                                <span className="text-2xl">{currentSet.emoji}</span>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-sm font-bold" style={{ color: currentSet.color }}>
                                            {currentSet.name}
                                        </h3>
                                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{
                                            background: `${currentSet.color}20`,
                                            color: currentSet.color,
                                        }}>
                                            SET {auction.currentSetIndex + 1}/{auction.auctionSets.length}
                                        </span>
                                    </div>
                                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                                        {currentSet.description} • {auction.remainingPlayers.length} players remaining in set
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Set Progress Pills */}
                        <div className="flex gap-1.5 overflow-x-auto pb-1">
                            {auction.auctionSets.map((set, idx) => {
                                const isCurrent = idx === auction.currentSetIndex;
                                const isDone = idx < auction.currentSetIndex;
                                return (
                                    <div
                                        key={set.id}
                                        className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all"
                                        style={{
                                            background: isCurrent ? `${set.color}20` : isDone ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
                                            color: isCurrent ? set.color : isDone ? 'var(--color-text-muted)' : 'var(--color-text-muted)',
                                            border: isCurrent ? `1px solid ${set.color}40` : '1px solid transparent',
                                            opacity: isDone ? 0.5 : 1,
                                        }}
                                    >
                                        <span>{set.emoji}</span>
                                        <span>{set.shortName}</span>
                                        {isDone && <span>✓</span>}
                                        {isCurrent && (
                                            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: set.color }} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div className="grid lg:grid-cols-3 gap-6">
                    {/* Main Auction Panel */}
                    <div className="lg:col-span-2">
                        <AuctionPanel
                            currentPlayer={auction?.currentPlayer || null}
                            currentBid={auction?.currentBid || 0}
                            currentBidder={auction?.currentBidder || null}
                            timerEnd={auction?.timerEnd || null}
                            userPurse={userTeam?.purse || 0}
                            onBid={handleBid}
                            canBid={canBid || false}
                            status={auction?.status || 'idle'}
                            isHost={isHost}
                            onNext={handleNext}
                            onSell={handleSell}
                            onSkipPlayer={handleSkipPlayer}
                            onSkipSet={handleSkipSet}
                            onEndAuction={handleEndAuction}
                            onViewTeams={() => setIsSquadsModalOpen(true)}
                        />

                        {/* Recent Sales */}
                        {auction && auction.soldPlayers.length > 0 && (
                            <div className="panel mt-6">
                                <h3 className="text-sm font-semibold tracking-wider uppercase mb-4" style={{ color: 'var(--color-text-muted)' }}>
                                    Recent Sales
                                </h3>
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {auction.soldPlayers.slice().reverse().slice(0, 10).map((sale, i) => (
                                        <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg"
                                            style={{ background: 'var(--color-bg-primary)' }}>
                                            <div className="flex items-center gap-3">
                                                <span className="text-sm font-semibold">{sale.player.name}</span>
                                                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{
                                                    background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-muted)',
                                                }}>{sale.player.role}</span>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-sm font-bold gold-text">₹{sale.soldPrice} Cr</span>
                                                <span className="text-[10px] ml-2" style={{ color: 'var(--color-text-muted)' }}>→ {sale.soldTo.teamName}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Teams Sidebar */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold tracking-wider uppercase" style={{ color: 'var(--color-text-muted)' }}>
                            Teams
                        </h3>
                        {auction?.teams.map((team) => {
                            const iplTeam = IPL_TEAMS.find(t => t.name === team.teamName || t.id === team.teamId);
                            const teamColor = iplTeam?.color || 'var(--color-gold)';
                            return (
                                <div key={team.userId} className={`panel transition-all`} style={{
                                    borderColor: team.userId === userId ? `${teamColor}80` : undefined,
                                }}>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            {iplTeam && (
                                                <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0" style={{
                                                    background: `${teamColor}15`,
                                                }}>
                                                    <img
                                                        src={iplTeam.logo}
                                                        alt={iplTeam.shortName}
                                                        width={28}
                                                        height={28}
                                                        className="object-contain"
                                                        onError={(e) => {
                                                            (e.target as HTMLImageElement).style.display = 'none';
                                                            (e.target as HTMLImageElement).parentElement!.textContent = iplTeam.emoji;
                                                        }}
                                                    />
                                                </div>
                                            )}
                                            <div>
                                                <p className="text-sm font-bold" style={{ color: teamColor }}>{iplTeam?.shortName || team.teamName}</p>
                                                <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{team.username}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-bold" style={{ color: teamColor }}>₹{team.purse} Cr</p>
                                            <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                                                {team.squad.length}/25 players
                                            </p>
                                        </div>
                                    </div>
                                    {/* Purse bar */}
                                    <div className="h-1 rounded-full" style={{ background: 'var(--color-border)' }}>
                                        <div className="h-full rounded-full transition-all duration-300" style={{
                                            width: `${(team.purse / 100) * 100}%`,
                                            background: team.purse < 10 ? 'var(--color-danger)' : teamColor,
                                        }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </main>

            {/* Custom Sold Popup Overlay */}
            {showSoldPopup && lastSale && (
                <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none" style={{
                    background: 'radial-gradient(circle at center, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.8) 100%)',
                    backdropFilter: 'blur(4px)',
                }}>
                    <div className={`p-8 rounded-3xl text-center transform scale-110 pointer-events-auto transition-all animate-bounce-in`} style={{
                        background: 'var(--color-bg-elevated)',
                        border: `2px solid ${lastSale.status === 'sold' ? 'var(--color-success)' : 'var(--color-danger)'}`,
                        boxShadow: `0 20px 40px -10px ${lastSale.status === 'sold' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                    }}>
                        <div className="text-6xl mb-4">
                            {lastSale.status === 'sold' ? '🤝' : '❌'}
                        </div>
                        <h2 className="text-3xl font-black uppercase tracking-widest mb-2" style={{
                            color: lastSale.status === 'sold' ? 'var(--color-success)' : 'var(--color-danger)',
                        }}>
                            {lastSale.status === 'sold' ? 'SOLD!' : 'UNSOLD'}
                        </h2>
                        <h3 className="text-2xl font-bold mb-4">{lastSale.player.name}</h3>

                        {lastSale.status === 'sold' && (
                            <div className="flex items-center justify-center gap-4 bg-black/40 py-3 px-6 rounded-xl border border-white/5">
                                <div className="text-left">
                                    <p className="text-xs uppercase tracking-wider text-white/50">Sold To</p>
                                    <p className="text-xl font-bold">{lastSale.team}</p>
                                </div>
                                <div className="w-px h-10 bg-white/10" />
                                <div className="text-right">
                                    <p className="text-xs uppercase tracking-wider text-white/50">Price</p>
                                    <p className="text-xl font-black gold-text">₹{lastSale.bid} Cr</p>
                                </div>
                            </div>
                        )}
                        <p className="text-xs mt-4 opacity-50">Resuming auction...</p>
                    </div>
                </div>
            )}

            {/* View Squads Modal */}
            {isSquadsModalOpen && auction && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{
                    background: 'rgba(0,0,0,0.8)',
                    backdropFilter: 'blur(8px)',
                }}>
                    <div className="w-full max-w-4xl max-h-[85vh] flex flex-col rounded-2xl overflow-hidden" style={{
                        background: 'var(--color-bg-primary)',
                        border: '1px solid var(--color-border)',
                    }}>
                        <div className="p-4 border-b flex justify-between items-center" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}>
                            <h2 className="text-xl font-bold">All Franchise Squads</h2>
                            <button onClick={() => setIsSquadsModalOpen(false)} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">
                                ✕
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
                            <div className="grid md:grid-cols-2 gap-6">
                                {auction.teams.map(team => {
                                    const iplTeam = IPL_TEAMS.find(t => t.name === team.teamName || t.id === team.teamId);
                                    const teamColor = iplTeam?.color || 'var(--color-gold)';
                                    return (
                                        <div key={team.userId} className="p-4 rounded-xl border" style={{ borderColor: `${teamColor}30`, background: `${teamColor}05` }}>
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="flex items-center gap-3">
                                                    {iplTeam && (
                                                        <img src={iplTeam.logo} alt={iplTeam.shortName} className="w-10 h-10 object-contain" />
                                                    )}
                                                    <div>
                                                        <h3 className="font-bold text-lg" style={{ color: teamColor }}>{iplTeam?.name || team.teamName}</h3>
                                                        <p className="text-xs opacity-70">By {team.username}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="font-black text-xl gold-text">₹{team.purse} Cr</div>
                                                    <div className="text-xs opacity-70">Remaining</div>
                                                </div>
                                            </div>

                                            <div className="space-y-1">
                                                <div className="flex justify-between text-xs font-semibold mb-2 text-white/40 uppercase tracking-wider px-2">
                                                    <span>Player ({team.squad.length}/25)</span>
                                                    <span>Price</span>
                                                </div>
                                                {team.squad.length === 0 ? (
                                                    <div className="text-center py-4 text-xs opacity-50 bg-black/20 rounded-lg">No players acquired yet</div>
                                                ) : (
                                                    team.squad.map((s, i) => (
                                                        <div key={i} className="flex justify-between items-center text-sm py-1.5 px-3 rounded bg-black/40 border border-white/5">
                                                            <span>{s.player.name}</span>
                                                            <span className="font-semibold gold-text">₹{s.soldPrice}</span>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* View Player Sets Modal */}
            {isPlayerSetsModalOpen && auction?.auctionSets && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{
                    background: 'rgba(0,0,0,0.8)',
                    backdropFilter: 'blur(8px)',
                }}>
                    <div className="w-full max-w-5xl max-h-[85vh] flex flex-col rounded-2xl overflow-hidden" style={{
                        background: 'var(--color-bg-primary)',
                        border: '1px solid var(--color-border)',
                    }}>
                        <div className="p-4 border-b flex justify-between items-center" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}>
                            <h2 className="text-xl font-bold">📋 Auction Player Sets</h2>
                            <button onClick={() => setIsPlayerSetsModalOpen(false)} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">
                                ✕
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
                            <div className="space-y-6">
                                {auction.auctionSets.map((set, setIdx) => {
                                    const isDone = setIdx < auction.currentSetIndex;
                                    const isCurrent = setIdx === auction.currentSetIndex;
                                    // Build a lookup of sold player IDs
                                    const soldIds = new Set(auction.soldPlayers.map((s: any) => s.player.id));
                                    const unsoldIds = new Set(auction.unsoldPlayers?.map((p: any) => p.id) || []);

                                    return (
                                        <div key={set.id} className="rounded-xl border overflow-hidden" style={{
                                            borderColor: isCurrent ? `${set.color}60` : 'var(--color-border)',
                                            background: isCurrent ? `${set.color}05` : 'var(--color-bg-elevated)',
                                        }}>
                                            <div className="p-4 flex items-center gap-3" style={{
                                                background: isCurrent ? `${set.color}10` : 'rgba(255,255,255,0.02)',
                                                borderBottom: '1px solid var(--color-border)',
                                            }}>
                                                <span className="text-2xl">{set.emoji}</span>
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="font-bold" style={{ color: set.color }}>{set.name}</h3>
                                                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{
                                                            background: isDone ? 'rgba(34,197,94,0.15)' : isCurrent ? `${set.color}20` : 'rgba(255,255,255,0.05)',
                                                            color: isDone ? 'var(--color-success)' : isCurrent ? set.color : 'var(--color-text-muted)',
                                                        }}>
                                                            {isDone ? '✓ Completed' : isCurrent ? '● Active' : 'Upcoming'}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                                                        {set.description} • {set.players.length} players
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="p-4">
                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                                    {set.players.map((player: any) => {
                                                        const isSold = soldIds.has(player.id);
                                                        const isUnsold = unsoldIds.has(player.id);
                                                        const soldInfo = isSold ? auction.soldPlayers.find((s: any) => s.player.id === player.id) : null;
                                                        const iplTeam = soldInfo ? IPL_TEAMS.find(t => t.name === soldInfo.soldTo.teamName) : null;

                                                        return (
                                                            <div key={player.id} className="flex items-center gap-2 py-2 px-3 rounded-lg text-sm" style={{
                                                                background: isSold ? 'rgba(34,197,94,0.08)' : isUnsold ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)',
                                                                border: `1px solid ${isSold ? 'rgba(34,197,94,0.2)' : isUnsold ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)'}`,
                                                                opacity: (isSold || isUnsold) ? 0.7 : 1,
                                                            }}>
                                                                <PlayerAvatar name={player.name} size={28} />
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="font-medium truncate">{player.name}</p>
                                                                    <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                                                                        {player.role} • ₹{player.basePrice} Cr
                                                                    </p>
                                                                </div>
                                                                {isSold && (
                                                                    <div className="text-right flex-shrink-0">
                                                                        <span className="text-[10px] font-bold" style={{ color: iplTeam?.color || 'var(--color-success)' }}>
                                                                            {iplTeam?.shortName || soldInfo?.soldTo.teamName}
                                                                        </span>
                                                                        <p className="text-[10px] gold-text">₹{soldInfo?.soldPrice}</p>
                                                                    </div>
                                                                )}
                                                                {isUnsold && (
                                                                    <span className="text-[10px] font-bold" style={{ color: 'var(--color-danger)' }}>UNSOLD</span>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
