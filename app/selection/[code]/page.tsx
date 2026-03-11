'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useUserStore } from '@/lib/store';
import Navbar from '@/components/Navbar';
import PlayerAvatar from '@/components/PlayerAvatar';
import { IPL_TEAMS } from '@/data/teams';

interface SquadPlayer {
    player: {
        id: string;
        name: string;
        role: string;
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
    teamId?: string;
    squad: SquadPlayer[];
}

export default function SelectionPage() {
    const params = useParams();
    const code = params.code as string;
    const router = useRouter();
    const { userId, isLoggedIn, setUser } = useUserStore();

    const [loading, setLoading] = useState(true);
    const [hostId, setHostId] = useState<string | null>(null);
    const [myTeam, setMyTeam] = useState<TeamData | null>(null);
    const [allTeams, setAllTeams] = useState<TeamData[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isLocked, setIsLocked] = useState(false);
    const [captainId, setCaptainId] = useState<string | null>(null);
    const [wkId, setWkId] = useState<string | null>(null);
    const [openingBowlerId, setOpeningBowlerId] = useState<string | null>(null);

    // Status tracking for everyone
    const [selectionsStatus, setSelectionsStatus] = useState<Record<string, string[]>>({});

    const fetchData = useCallback(async () => {
        try {
            // Get auction squad data
            const auctionRes = await fetch(`/api/auction?roomCode=${code}`);
            if (auctionRes.ok) {
                const data = await auctionRes.json();
                if (data.state && data.state.teams) {
                    setAllTeams(data.state.teams);
                    const userTeam = data.state.teams.find((t: TeamData) => t.userId === userId);
                    if (userTeam) setMyTeam(userTeam);
                }
            }

            // Get selections status
            const selRes = await fetch(`/api/selection?roomCode=${code}`);
            if (selRes.ok) {
                const selData = await selRes.json();
                if (selData.selections) {
                    setSelectionsStatus(selData.selections);
                    if (userId && selData.selections[userId]) {
                        const sel = selData.selections[userId];
                        setSelectedIds(new Set(sel.selectedIds || sel));
                        setIsLocked(true);
                        if (sel.captainId) setCaptainId(sel.captainId);
                        if (sel.wkId) setWkId(sel.wkId);
                        if (sel.openingBowlerId) setOpeningBowlerId(sel.openingBowlerId);
                    }
                }
            }
        } catch (err) {
            console.error('Failed to fetch selection data:', err);
        }
    }, [code, userId]);

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
                // If match already started, auto-redirect
                if (roomData.room.status === 'MATCH' || roomData.room.status === 'match') {
                    router.push(`/match/${code}`);
                }
                if (roomData.room.status === 'LEAGUE' || roomData.room.status === 'league') {
                    router.push(`/league/${code}`);
                }
            }

            await fetchData();
            setLoading(false);
        };
        init();

        // Always poll for status updates
        const interval = setInterval(fetchData, 2000);
        return () => clearInterval(interval);
    }, [isLoggedIn, code, userId, router, setUser, fetchData]);

    const handleTogglePlayer = (playerId: string) => {
        if (isLocked) return;

        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(playerId)) {
                next.delete(playerId);
                // Clear roles if this player was assigned any
                if (captainId === playerId) setCaptainId(null);
                if (wkId === playerId) setWkId(null);
                if (openingBowlerId === playerId) setOpeningBowlerId(null);
            } else {
                if (next.size >= 11) return prev; // Max 11
                next.add(playerId);

                // Auto-assign roles for better UX
                if (myTeam) {
                    const playerObj = myTeam.squad.find(s => s.player.id === playerId)?.player;
                    if (playerObj) {
                        // 1. Auto-assign WK if none set and player is a WK
                        if (!wkId && playerObj.role === 'WICKET_KEEPER') {
                            setWkId(playerId);
                        }
                        // 2. Auto-assign Captain if none set
                        if (!captainId) {
                            setCaptainId(playerId);
                        }
                        // 3. Auto-assign Opening Bowler if none set and is a bowler/all-rounder
                        if (!openingBowlerId && (playerObj.role === 'BOWLER' || playerObj.role === 'ALL_ROUNDER')) {
                            setOpeningBowlerId(playerId);
                        }
                    }
                }
            }
            return next;
        });
    };

    const handleLockSelection = async () => {
        if (selectedIds.size !== 11) return;
        if (!captainId || !wkId || !openingBowlerId) {
            alert('Please select a Captain, Wicketkeeper, and Opening Bowler before locking.');
            return;
        }

        try {
            const res = await fetch('/api/selection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomCode: code,
                    teamId: userId,
                    selectedIds: Array.from(selectedIds),
                    captainId,
                    wkId,
                    openingBowlerId
                })
            });
            if (res.ok) {
                setIsLocked(true);
                fetchData();
            }
        } catch (err) {
            console.error('Failed to lock selection:', err);
        }
    };

    const handleSetRole = (playerId: string, roleType: 'captain' | 'wk' | 'bowler') => {
        if (isLocked) return;
        if (!selectedIds.has(playerId)) return;

        if (roleType === 'captain') setCaptainId(playerId);
        else if (roleType === 'wk') setWkId(playerId);
        else if (roleType === 'bowler') setOpeningBowlerId(playerId);
    };

    const handleStartMatch = async () => {
        try {
            // Initialize the league
            const leagueRes = await fetch('/api/league', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'init',
                    roomCode: code,
                }),
            });

            if (!leagueRes.ok) {
                const err = await leagueRes.json();
                console.error('League init failed:', err);
                return;
            }

            router.push(`/league/${code}`);
        } catch (err) {
            console.error('Failed to start league:', err);
        }
    };

    const isHost = hostId === userId;
    const allLocked = allTeams.length > 0 && allTeams.every(t => selectionsStatus[t.userId]?.length === 11);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-primary)' }}>
                <div className="shimmer w-16 h-16 rounded-2xl" />
            </div>
        );
    }

    return (
        <div className="min-h-screen pb-24" style={{ background: 'var(--color-bg-primary)' }}>
            <Navbar />

            {/* Fixed Bottom Bar */}
            <div className="fixed bottom-0 left-0 right-0 p-4 z-50 border-t" style={{ background: 'var(--color-bg-elevated)', borderTopColor: 'var(--color-border)' }}>
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div>
                        <p className="text-sm font-bold text-white mb-1">Playing 11 Selection</p>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            Selected: <span className={selectedIds.size === 11 ? 'gold-text font-bold' : ''}>{selectedIds.size}/11</span>
                        </p>
                    </div>

                    <div className="flex-1 px-8">
                        {!isLocked && selectedIds.size === 11 && (
                            <div className="flex gap-4">
                                <span className={`text-[10px] font-bold px-2 py-1 rounded border transition-colors ${captainId ? 'bg-gold/10 text-gold border-gold/30' : 'bg-red-500/10 text-red-500 border-red-500/30'}`}>
                                    {captainId ? '✓ Captain' : '! Cap Missing'}
                                </span>
                                <span className={`text-[10px] font-bold px-2 py-1 rounded border transition-colors ${wkId ? 'bg-blue-500/10 text-blue-500 border-blue-500/30' : 'bg-red-500/10 text-red-500 border-red-500/30'}`}>
                                    {wkId ? '✓ WK' : '! WK Missing'}
                                </span>
                                <span className={`text-[10px] font-bold px-2 py-1 rounded border transition-colors ${openingBowlerId ? 'bg-red-500/10 text-red-500 border-red-500/30' : 'bg-red-500/10 text-red-500 border-red-500/30'}`}>
                                    {openingBowlerId ? '✓ Opener' : '! Opener Missing'}
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-4">
                        {!isLocked ? (
                            <button
                                onClick={handleLockSelection}
                                disabled={selectedIds.size !== 11}
                                className={selectedIds.size === 11 ? 'btn-primary' : 'btn-secondary opacity-50 cursor-not-allowed'}
                            >
                                Lock Playing 11 🔒
                            </button>
                        ) : (
                            <div className="flex items-center gap-4">
                                <span className="text-sm font-semibold gold-text flex items-center gap-2">
                                    ✓ Selection Locked
                                </span>
                                {isHost && (
                                    <button
                                        onClick={handleStartMatch}
                                        disabled={!allLocked}
                                        className={allLocked ? 'btn-primary animate-pulse' : 'btn-secondary opacity-50 cursor-not-allowed'}
                                        title={!allLocked ? "Waiting for other players to lock..." : "Start the league!"}
                                    >
                                        Start League 🏏
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <main className="max-w-7xl mx-auto px-6 pt-24">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold mb-2">Choose Your Playing 11</h1>
                    <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                        Select the top 11 players from your squad to take the field.
                    </p>
                </div>

                <div className="grid lg:grid-cols-4 gap-8">
                    {/* Main Selection Area */}
                    <div className="lg:col-span-3">
                        {myTeam ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {myTeam.squad.map(({ player }) => {
                                    const isSelected = selectedIds.has(player.id);
                                    const isCap = captainId === player.id;
                                    const isWk = wkId === player.id;
                                    const isBowler = openingBowlerId === player.id;

                                    return (
                                        <div
                                            key={player.id}
                                            onClick={() => !isLocked && handleTogglePlayer(player.id)}
                                            className="panel relative overflow-hidden cursor-pointer transition-all duration-300"
                                            style={{
                                                borderColor: isSelected ? 'var(--color-gold)' : 'var(--color-border)',
                                                background: isSelected ? 'rgba(212, 175, 55, 0.05)' : 'var(--color-bg-primary)',
                                                transform: isSelected ? 'translateY(-2px)' : 'none',
                                                opacity: isLocked && !isSelected ? 0.5 : 1
                                            }}
                                        >
                                            {/* Role Badges */}
                                            <div className="absolute top-2 right-2 flex flex-col gap-1 z-10">
                                                {isCap && (
                                                    <span className="px-2 py-0.5 rounded bg-gold text-black text-[9px] font-black tracking-tighter uppercase shadow-[0_0_10px_rgba(212,175,55,0.5)] border border-white/20">
                                                        CAPTAIN
                                                    </span>
                                                )}
                                                {isWk && (
                                                    <span className="px-2 py-0.5 rounded bg-blue-500 text-white text-[9px] font-black tracking-tighter uppercase shadow-[0_0_10px_rgba(59,130,246,0.5)] border border-white/20">
                                                        WK
                                                    </span>
                                                )}
                                                {isBowler && (
                                                    <span className="px-2 py-0.5 rounded bg-red-500 text-white text-[9px] font-black tracking-tighter uppercase shadow-[0_0_10px_rgba(239,68,68,0.5)] border border-white/20">
                                                        OPENER
                                                    </span>
                                                )}
                                                {isSelected && !isCap && !isWk && !isBowler && (
                                                    <div className="w-6 h-6 rounded-full flex items-center justify-center bg-gold text-black text-[12px] font-bold shadow-lg">
                                                        ✓
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-4">
                                                <PlayerAvatar
                                                    role={player.role as any}
                                                    name={player.name}
                                                    size="lg"
                                                />
                                                <div className="flex-1">
                                                    <h4 className="font-bold text-sm text-white mb-1 truncate pr-16">{player.name}</h4>
                                                    <div className="flex items-center gap-3 text-[10px]">
                                                        <span style={{ color: 'var(--color-text-muted)' }}>{player.role.replace('_', ' ')}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Role Selection Controls */}
                                            {isSelected && !isLocked && (
                                                <div className="flex gap-2 mt-4 pt-4 border-t border-white/10" onClick={e => e.stopPropagation()}>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSetRole(player.id, 'captain')}
                                                        className={`flex-1 py-1.5 rounded text-[9px] font-black uppercase transition-all duration-300 border ${isCap ? 'bg-gold text-black border-gold shadow-[0_0_15px_rgba(212,175,55,0.3)]' : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/10 hover:text-white'}`}
                                                    >
                                                        Captain
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSetRole(player.id, 'wk')}
                                                        className={`flex-1 py-1.5 rounded text-[9px] font-black uppercase transition-all duration-300 border ${isWk ? 'bg-blue-600 text-white border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/10 hover:text-white'}`}
                                                    >
                                                        WK
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSetRole(player.id, 'bowler')}
                                                        className={`flex-1 py-1.5 rounded text-[9px] font-black uppercase transition-all duration-300 border ${isBowler ? 'bg-red-600 text-white border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/10 hover:text-white'}`}
                                                    >
                                                        Opener
                                                    </button>
                                                </div>
                                            )}

                                            {/* Skills */}
                                            <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
                                                <div>
                                                    <div className="flex justify-between text-[10px] mb-1">
                                                        <span style={{ color: 'var(--color-text-muted)' }}>Batting</span>
                                                        <span className="font-mono">{player.battingSkill}</span>
                                                    </div>
                                                    <div className="h-1 rounded-full bg-white/5">
                                                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${player.battingSkill}%` }} />
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="flex justify-between text-[10px] mb-1">
                                                        <span style={{ color: 'var(--color-text-muted)' }}>Bowling</span>
                                                        <span className="font-mono">{player.bowlingSkill}</span>
                                                    </div>
                                                    <div className="h-1 rounded-full bg-white/5">
                                                        <div className="h-full rounded-full bg-red-500" style={{ width: `${player.bowlingSkill}%` }} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="panel text-center py-12">
                                <p style={{ color: 'var(--color-text-muted)' }}>You do not have a squad.</p>
                            </div>
                        )}
                    </div>

                    {/* Opponent Status Sidebar */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold tracking-wider uppercase mb-4" style={{ color: 'var(--color-text-muted)' }}>
                            Lobby Readiness
                        </h3>
                        {allTeams.map(team => {
                            const iplTeam = IPL_TEAMS.find(t => t.name === team.teamName || t.id === team.teamId);
                            const teamColor = iplTeam?.color || 'var(--color-gold)';
                            const isTeamLocked = selectionsStatus[team.userId]?.length === 11;

                            return (
                                <div key={team.userId} className="panel" style={{
                                    borderLeft: `4px solid ${isTeamLocked ? 'var(--color-success)' : teamColor}`
                                }}>
                                    <div className="flex items-center gap-3">
                                        {iplTeam && (
                                            <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center" style={{ background: `${teamColor}15` }}>
                                                <span className="text-sm">{iplTeam.emoji}</span>
                                            </div>
                                        )}
                                        <div className="flex-1">
                                            <p className="text-sm font-bold text-white">{iplTeam?.shortName || team.teamName}</p>
                                            <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{team.username}</p>
                                        </div>
                                        <div>
                                            {isTeamLocked ? (
                                                <span className="px-2 py-1 rounded text-[10px] font-bold bg-green-500/20 text-green-400">READY</span>
                                            ) : (
                                                <span className="px-2 py-1 rounded text-[10px] font-bold bg-white/5" style={{ color: 'var(--color-text-muted)' }}>SELECTING...</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </main>
        </div>
    );
}
