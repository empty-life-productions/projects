'use client';

interface RoomCardProps {
    code: string;
    status: string;
    playerCount: number;
    maxPlayers: number;
    players: string[];
    hostId: string;
    currentUserId: string;
    onJoin: (code: string) => void;
    onDelete?: (code: string) => void;
}

export default function RoomCard({ code, status, playerCount, maxPlayers, players, hostId, currentUserId, onJoin, onDelete }: RoomCardProps) {
    const statusColors: Record<string, string> = {
        waiting: 'badge-gold',
        auction: 'badge-success',
        match: 'badge-success',
        completed: 'badge-danger',
    };

    const isHost = hostId === currentUserId;

    return (
        <div className="panel group hover:border-[var(--color-gold-dark)] transition-all duration-300 cursor-pointer"
            onClick={() => onJoin(code)}>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <span className="text-lg font-mono font-bold tracking-wider gold-text">{code}</span>
                    {isHost && (
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{
                                background: 'rgba(212, 175, 55, 0.1)', color: 'var(--color-gold)',
                            }}>HOST</span>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (onDelete) onDelete(code);
                                }}
                                className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 transition-colors"
                                title="Destroy Session"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                            </button>
                        </div>
                    )}
                </div>
                <span className={`badge ${statusColors[status] || 'badge-gold'} text-[10px] uppercase`}>
                    {status}
                </span>
            </div>

            <div className="flex items-center justify-between">
                <div className="flex -space-x-2">
                    {players.slice(0, 5).map((p, i) => (
                        <div key={i} className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold border-2"
                            style={{
                                background: 'var(--color-bg-elevated)',
                                borderColor: 'var(--color-bg-panel)',
                                color: 'var(--color-text-secondary)',
                            }}>
                            {p.charAt(0).toUpperCase()}
                        </div>
                    ))}
                    {players.length > 5 && (
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold border-2"
                            style={{ background: 'var(--color-bg-elevated)', borderColor: 'var(--color-bg-panel)', color: 'var(--color-text-muted)' }}>
                            +{players.length - 5}
                        </div>
                    )}
                </div>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {playerCount}/{maxPlayers} players
                </span>
            </div>
        </div>
    );
}
