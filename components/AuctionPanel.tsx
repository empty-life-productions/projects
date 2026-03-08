'use client';

import { useState, useEffect, useCallback } from 'react';
import PlayerAvatar from '@/components/PlayerAvatar';

interface AuctionPanelProps {
    currentPlayer: {
        name: string;
        role: string;
        basePrice: number;
        battingSkill: number;
        bowlingSkill: number;
        nationality?: string;
    } | null;
    currentBid: number;
    currentBidder: { username: string; teamName: string } | null;
    timerEnd: number | null;
    userPurse: number;
    onBid: (amount: number) => void;
    canBid: boolean;
    status: string;
    isHost: boolean;
    onNext: () => void;
    onSell: () => void;
    onSkipPlayer?: () => void;
    onSkipSet?: () => void;
    onEndAuction?: () => void;
    onViewTeams?: () => void;
    // RTM props
    rtmPending?: boolean;
    rtmOriginalTeamId?: string | null;
    currentUserId?: string;
    onRtm?: (execute: boolean) => void;
}

export default function AuctionPanel({
    currentPlayer,
    currentBid,
    currentBidder,
    timerEnd,
    userPurse,
    onBid,
    canBid,
    status,
    isHost,
    onNext,
    onSell,
    onSkipPlayer,
    onSkipSet,
    onEndAuction,
    onViewTeams,
    rtmPending,
    rtmOriginalTeamId,
    currentUserId,
    onRtm,
}: AuctionPanelProps) {
    const [timeLeft, setTimeLeft] = useState(0);
    const BID_INCREMENT = 0.25;

    // Suppress unused variable
    void onSell;

    const updateTimer = useCallback(() => {
        if (timerEnd) {
            const remaining = Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000));
            setTimeLeft(remaining);
        } else {
            setTimeLeft(0);
        }
    }, [timerEnd]);

    useEffect(() => {
        updateTimer();
        const interval = setInterval(updateTimer, 100);
        return () => clearInterval(interval);
    }, [updateTimer]);

    const roleColors: Record<string, string> = {
        BATSMAN: '#4FC3F7',
        BOWLER: '#EF5350',
        ALL_ROUNDER: '#66BB6A',
        WICKET_KEEPER: '#FFA726',
    };

    const roleLabels: Record<string, string> = {
        BATSMAN: 'Batsman',
        BOWLER: 'Bowler',
        ALL_ROUNDER: 'All-Rounder',
        WICKET_KEEPER: 'Wicket Keeper',
    };

    const roleEmoji: Record<string, string> = {
        BATSMAN: '🏏',
        BOWLER: '🎯',
        ALL_ROUNDER: '⭐',
        WICKET_KEEPER: '🧤',
    };

    if (!currentPlayer && status !== 'completed') {
        return (
            <div className="panel-elevated text-center py-16">
                {status === 'idle' ? (
                    <>
                        <h2 className="text-xl font-bold mb-2">Auction Ready</h2>
                        <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
                            {isHost ? 'Click below to start the bidding' : 'Waiting for host to start the bidding...'}
                        </p>
                        {isHost && (
                            <button onClick={onNext} className="btn-primary px-6 py-3">
                                Start First Bid
                            </button>
                        )}
                    </>
                ) : (
                    <>
                        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                            {isHost ? 'Click Next Player to continue' : 'Loading next player...'}
                        </p>
                        {isHost && (
                            <button onClick={onNext} className="btn-primary px-6 py-3 mt-4">
                                Next Player
                            </button>
                        )}
                    </>
                )}
            </div>
        );
    }

    if (status === 'completed') {
        return (
            <div className="panel-gold text-center py-16">
                <span className="text-5xl mb-4 block">🏆</span>
                <h2 className="text-2xl font-bold gold-text mb-2">Auction Complete!</h2>
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    All players have been auctioned. Time for the matches!
                </p>
            </div>
        );
    }

    return (
        <div className="panel-elevated">
            {/* Top Bar: Timer & View Teams */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <span className="badge badge-gold">LIVE BIDDING</span>
                    {onViewTeams && (
                        <button
                            onClick={onViewTeams}
                            className="text-[11px] font-bold px-3 py-1.5 rounded-lg border flex items-center gap-1 transition-all"
                            style={{
                                borderColor: 'var(--color-border)',
                                background: 'var(--color-bg-primary)',
                                color: 'var(--color-text-secondary)',
                            }}
                        >
                            📊 View Teams
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${timeLeft <= 5 ? 'animate-pulse' : ''
                        }`} style={{
                            background: timeLeft <= 5 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(212, 175, 55, 0.1)',
                            color: timeLeft <= 5 ? 'var(--color-danger)' : 'var(--color-gold)',
                        }}>
                        {timeLeft}
                    </div>
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>sec</span>
                </div>
            </div>

            {/* Player Card — Enhanced with Avatar */}
            {currentPlayer && (
                <div className="rounded-xl p-6 mb-6 text-center relative overflow-hidden" style={{
                    background: `linear-gradient(135deg, ${roleColors[currentPlayer.role]}08, ${roleColors[currentPlayer.role]}03)`,
                    border: `1px solid ${roleColors[currentPlayer.role]}25`,
                }}>
                    {/* Nationality badge */}
                    <div className="absolute top-3 left-3">
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{
                            background: currentPlayer.nationality === 'Indian' ? 'rgba(255, 153, 51, 0.15)' : 'rgba(79, 195, 247, 0.15)',
                            color: currentPlayer.nationality === 'Indian' ? '#FF9933' : '#4FC3F7',
                            border: `1px solid ${currentPlayer.nationality === 'Indian' ? '#FF993330' : '#4FC3F730'}`,
                        }}>
                            {currentPlayer.nationality === 'Indian' ? '🇮🇳 Indian' : '🌍 Overseas'}
                        </span>
                    </div>

                    {/* Player Avatar */}
                    <div className="mt-4">
                        <PlayerAvatar
                            name={currentPlayer.name}
                            role={currentPlayer.role as 'BATSMAN' | 'BOWLER' | 'ALL_ROUNDER' | 'WICKET_KEEPER'}
                            imageUrl={`/api/player-image?name=${encodeURIComponent(currentPlayer.name)}&size=200`}
                            size="xl"
                        />
                    </div>

                    <h3 className="text-xl font-bold mb-1 mt-3">{currentPlayer.name}</h3>

                    {/* Role badge with emoji */}
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold mb-4" style={{
                        background: `${roleColors[currentPlayer.role]}20`,
                        color: roleColors[currentPlayer.role],
                    }}>
                        {roleEmoji[currentPlayer.role]} {roleLabels[currentPlayer.role] || currentPlayer.role}
                    </span>

                    {/* Skill bars */}
                    <div className="grid grid-cols-3 gap-4 mt-4">
                        <div>
                            <div className="text-lg font-bold" style={{ color: '#4FC3F7' }}>{currentPlayer.battingSkill}</div>
                            <div className="h-1 rounded-full mt-1 overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                                <div className="h-full rounded-full" style={{ width: `${currentPlayer.battingSkill}%`, background: '#4FC3F7' }} />
                            </div>
                            <div className="text-[10px] uppercase tracking-wider mt-1" style={{ color: 'var(--color-text-muted)' }}>Batting</div>
                        </div>
                        <div>
                            <div className="text-lg font-bold" style={{ color: '#EF5350' }}>{currentPlayer.bowlingSkill}</div>
                            <div className="h-1 rounded-full mt-1 overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                                <div className="h-full rounded-full" style={{ width: `${currentPlayer.bowlingSkill}%`, background: '#EF5350' }} />
                            </div>
                            <div className="text-[10px] uppercase tracking-wider mt-1" style={{ color: 'var(--color-text-muted)' }}>Bowling</div>
                        </div>
                        <div>
                            <div className="text-lg font-bold gold-text">₹{currentPlayer.basePrice}Cr</div>
                            <div className="h-1 rounded-full mt-1" style={{ background: 'var(--color-gold)' }} />
                            <div className="text-[10px] uppercase tracking-wider mt-1" style={{ color: 'var(--color-text-muted)' }}>Base Price</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Current Bid */}
            <div className="text-center mb-6 p-4 rounded-xl" style={{ background: 'var(--color-bg-primary)' }}>
                <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>
                    {currentBidder ? 'Current Bid' : 'Starting Price'}
                </p>
                <p className="text-3xl font-black gold-text">₹{currentBid} Cr</p>
                {currentBidder && (
                    <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                        by <span className="font-semibold">{currentBidder.username}</span>
                        <span className="text-xs ml-1" style={{ color: 'var(--color-text-muted)' }}>({currentBidder.teamName})</span>
                    </p>
                )}
            </div>

            {/* Bid Buttons */}
            {status === 'bidding' && (
                <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                        {[BID_INCREMENT, 0.5, 1].map((inc) => {
                            const bidAmount = Math.round((currentBid + inc) * 100) / 100;
                            const canAfford = bidAmount <= userPurse;
                            return (
                                <button
                                    key={inc}
                                    onClick={() => onBid(bidAmount)}
                                    disabled={!canBid || !canAfford}
                                    className="py-3 rounded-lg text-sm font-bold transition-all"
                                    style={{
                                        background: canBid && canAfford ? 'rgba(212, 175, 55, 0.1)' : 'rgba(255,255,255,0.03)',
                                        color: canBid && canAfford ? 'var(--color-gold)' : 'var(--color-text-muted)',
                                        border: `1px solid ${canBid && canAfford ? 'rgba(212, 175, 55, 0.3)' : 'var(--color-border)'}`,
                                        cursor: canBid && canAfford ? 'pointer' : 'not-allowed',
                                    }}
                                >
                                    +{inc} Cr
                                </button>
                            );
                        })}
                    </div>
                    <p className="text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
                        Your Purse: <span className="font-semibold gold-text">₹{userPurse} Cr</span>
                    </p>
                </div>
            )}
            {/* RTM Decision Section */}
            {rtmPending && (
                <div className="mt-6 p-6 rounded-2xl border-2 border-dashed animate-pulse-gold" style={{
                    background: 'rgba(212, 175, 55, 0.05)',
                    borderColor: 'var(--color-gold)',
                }}>
                    <div className="text-center">
                        <span className="text-3xl mb-3 block">🛡️</span>
                        <h3 className="text-lg font-black gold-text mb-1 uppercase tracking-tight">RTM Opportunity</h3>
                        <p className="text-xs font-medium mb-6 text-[var(--color-text-secondary)]">
                            {currentUserId === rtmOriginalTeamId
                                ? "This was your player! Do you want to match the highest bid and bring them back?"
                                : "The original team is deciding whether to use their Right-to-Match card..."}
                        </p>

                        {currentUserId === rtmOriginalTeamId && onRtm && (
                            <div className="flex gap-4">
                                <button
                                    onClick={() => onRtm(true)}
                                    className="flex-1 btn-primary py-4 text-xs font-black tracking-widest"
                                >
                                    USE RTM CARD (₹{currentBid} Cr)
                                </button>
                                <button
                                    onClick={() => onRtm(false)}
                                    className="flex-1 btn-secondary py-4 text-xs font-black tracking-widest opacity-60"
                                >
                                    DECLINE
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Host Controls for Sell/Unsold */}
            {isHost && (status === 'sold' || status === 'unsold') && (
                <div className="mt-4 p-4 rounded-xl text-center" style={{
                    background: status === 'sold' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                }}>
                    <p className="text-sm font-semibold mb-3" style={{
                        color: status === 'sold' ? 'var(--color-success)' : 'var(--color-danger)',
                    }}>
                        {status === 'sold'
                            ? `SOLD to ${currentBidder?.teamName} for ₹${currentBid} Cr!`
                            : 'UNSOLD — No bids received'}
                    </p>
                    <button onClick={onNext} className="btn-primary px-6 py-2">
                        Next Player →
                    </button>
                </div>
            )}

            {/* Host Overrides (Danger Zone) */}
            {isHost && (
                <div className="mt-6 pt-4 border-t flex flex-wrap gap-2 justify-center" style={{ borderColor: 'var(--color-border)' }}>
                    <button
                        onClick={onSkipPlayer}
                        className="text-[10px] px-3 py-1.5 rounded-lg border font-semibold transition-all hover:bg-red-500/10"
                        style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border)' }}
                        title="Mark player as unsold immediately"
                    >
                        ⏭ Skip Player
                    </button>
                    <button
                        onClick={onSkipSet}
                        className="text-[10px] px-3 py-1.5 rounded-lg border font-semibold transition-all hover:bg-red-500/10"
                        style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border)' }}
                        title="Mark rest of set as unsold and jump to next set"
                    >
                        ⏭ Skip Entire Set
                    </button>
                    <button
                        onClick={onEndAuction}
                        className="text-[10px] px-3 py-1.5 rounded-lg border font-semibold transition-all hover:bg-red-500/20"
                        style={{ color: '#EF5350', borderColor: 'rgba(239, 83, 80, 0.3)' }}
                        title="Finish the auction for everyone immediately"
                    >
                        ⏹ End Auction Early
                    </button>
                </div>
            )}
        </div>
    );
}
