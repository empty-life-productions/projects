'use client';

import { useState } from 'react';

interface PlayerAvatarProps {
    name: string;
    role?: 'BATSMAN' | 'BOWLER' | 'ALL_ROUNDER' | 'WICKET_KEEPER';
    imageUrl?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl' | number;
}

function resolveSize(size: 'sm' | 'md' | 'lg' | 'xl' | number): 'sm' | 'md' | 'lg' | 'xl' {
    if (typeof size === 'string') return size;
    if (size <= 28) return 'sm';
    if (size <= 36) return 'md';
    if (size <= 56) return 'lg';
    return 'xl';
}

const roleColors: Record<string, { bg: string; border: string }> = {
    BATSMAN: { bg: '#4FC3F720', border: '#4FC3F740' },
    BOWLER: { bg: '#EF535020', border: '#EF535040' },
    ALL_ROUNDER: { bg: '#66BB6A20', border: '#66BB6A40' },
    WICKET_KEEPER: { bg: '#FFA72620', border: '#FFA72640' },
};

const roleBadge: Record<string, string> = {
    BATSMAN: '🏏',
    BOWLER: '🎯',
    ALL_ROUNDER: '⭐',
    WICKET_KEEPER: '🧤',
};

const sizes = {
    sm: { container: 'w-8 h-8', text: 'text-xs', badge: 'w-3 h-3 text-[7px]' },
    md: { container: 'w-10 h-10', text: 'text-sm', badge: 'w-4 h-4 text-[8px]' },
    lg: { container: 'w-14 h-14', text: 'text-lg', badge: 'w-5 h-5 text-[10px]' },
    xl: { container: 'w-20 h-20', text: 'text-2xl', badge: 'w-6 h-6 text-[12px]' },
};

export default function PlayerAvatar({ name, role = 'BATSMAN', imageUrl, size = 'lg' }: PlayerAvatarProps) {
    const [imgError, setImgError] = useState(false);
    const resolvedSize = resolveSize(size);
    const s = sizes[resolvedSize];
    const colors = roleColors[role] || roleColors.BATSMAN;
    const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

    const hasImage = imageUrl && !imgError;

    return (
        <div className="relative inline-flex">
            <div
                className={`${s.container} rounded-full flex items-center justify-center font-black overflow-hidden`}
                style={{
                    background: hasImage ? 'transparent' : colors.bg,
                    border: `2px solid ${colors.border}`,
                }}
            >
                {hasImage ? (
                    <img
                        src={imageUrl}
                        alt={name}
                        className="w-full h-full object-cover"
                        onError={() => setImgError(true)}
                    />
                ) : (
                    <span className={`${s.text} font-black`} style={{ color: colors.border.replace('40', '') }}>
                        {initials}
                    </span>
                )}
            </div>
            {/* Role badge */}
            <div
                className={`absolute -bottom-0.5 -right-0.5 ${s.badge} rounded-full flex items-center justify-center`}
                style={{ background: 'var(--color-bg-elevated)', border: `1px solid ${colors.border}` }}
            >
                {roleBadge[role]}
            </div>
        </div>
    );
}

