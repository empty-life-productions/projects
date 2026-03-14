import React from 'react';
import { Stadium } from '@/data/stadiums';

export function StadiumCard({ stadium }: { stadium: Stadium }) {
    const renderStatBars = (value: number) => {
        return (
            <div className="flex gap-1 h-1.5 flex-1">
                {[1, 2, 3, 4, 5].map((segment) => (
                    <div
                        key={segment}
                        className={`flex-1 rounded-full ${
                            segment <= value
                                ? value >= 4
                                    ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]'
                                    : value >= 3
                                    ? 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]'
                                    : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                                : 'bg-white/10'
                        }`}
                    />
                ))}
            </div>
        );
    };

    return (
        <div className="relative overflow-hidden rounded-3xl border border-white/5 bg-[#0a0a0a] text-white p-8 mb-8 shadow-2xl">
            {/* Background Accent */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 blur-[100px] -z-10" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-yellow-500/5 blur-[100px] -z-10" />

            <div className="grid lg:grid-cols-[1.2fr_1.5fr_1.2fr] gap-8">
                {/* Left Panel: Primary Stats */}
                <div className="space-y-6">
                    <div className="flex items-center gap-5">
                        <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-4xl shadow-inner">
                            {stadium.emoji}
                        </div>
                        <div>
                            <h2 className="text-2xl font-black tracking-tight leading-none">{stadium.name}</h2>
                            <p className="text-sm opacity-50 font-bold uppercase tracking-widest mt-1">{stadium.city}</p>
                        </div>
                    </div>

                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
                        <span className="text-sm">🔥</span>
                        <span className="text-xs font-black text-green-400 uppercase tracking-widest">{stadium.pitchLabel}</span>
                    </div>

                    <div className="space-y-4 pt-2">
                        <div className="flex items-center gap-4">
                            <span className="text-[10px] font-black uppercase tracking-tighter w-20 opacity-40">Bounce</span>
                            {renderStatBars(stadium.bounce)}
                            <span className="text-[10px] font-black opacity-40 w-6">{stadium.bounce}/5</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-[10px] font-black uppercase tracking-tighter w-20 opacity-40">Turn</span>
                            {renderStatBars(stadium.turn)}
                            <span className="text-[10px] font-black opacity-40 w-6">{stadium.turn}/5</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-[10px] font-black uppercase tracking-tighter w-20 opacity-40">Bat-Friendly</span>
                            {renderStatBars(stadium.batFriendly)}
                            <span className="text-[10px] font-black opacity-40 w-6">{stadium.batFriendly}/5</span>
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                        <div>
                            <p className="text-[10px] font-black uppercase opacity-30 tracking-widest">Avg 1st Innings</p>
                            <p className="text-xl font-black">{stadium.avg1stInnings}</p>
                        </div>
                        <div className="w-[1px] h-8 bg-white/5" />
                        <div className="text-right">
                            <p className="text-[10px] font-black uppercase opacity-30 tracking-widest">Avg 2nd Innings</p>
                            <p className="text-xl font-black">{stadium.avg2ndInnings}</p>
                        </div>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-xl bg-blue-500/5 border border-blue-500/10">
                        <span className="text-[10px] font-black uppercase opacity-50">Dew Factor</span>
                        <div className="flex items-center gap-2">
                            <span className="text-blue-400">💧</span>
                            <span className="text-xs font-black text-blue-400 uppercase">{stadium.dewProbability > 0.5 ? 'YES' : 'MINIMAL'}</span>
                        </div>
                    </div>
                </div>

                {/* Middle Panel: Key Insights */}
                <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-6">
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] opacity-40 mb-6">Key Insights</h3>
                    <div className="space-y-5">
                        {stadium.keyInsights.map((insight, idx) => (
                            <div key={idx} className="flex gap-4 group">
                                <span className="text-sm mt-0.5 opacity-70 group-hover:scale-110 transition-transform">
                                    {idx === 0 ? '📍' : idx === 1 ? '🌊' : idx === 2 ? '🚀' : '⚠️'}
                                </span>
                                <p className="text-xs leading-relaxed opacity-70 group-hover:opacity-100 transition-opacity">
                                    {insight}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right Panel: Specialized Tips */}
                <div className="space-y-3">
                    <div className="p-4 rounded-2xl bg-yellow-500/5 border border-yellow-500/10 border-l-4 border-l-yellow-500/50 hover:bg-yellow-500/10 transition-colors">
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs">🪙</span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-yellow-500/70">Toss Insight</span>
                        </div>
                        <p className="text-[11px] leading-relaxed opacity-70">{stadium.tossInsight}</p>
                    </div>

                    <div className="p-4 rounded-2xl bg-red-500/5 border border-red-500/10 border-l-4 border-l-red-500/50 hover:bg-red-500/10 transition-colors">
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs">⚡</span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-red-500/70">Pace Tip</span>
                        </div>
                        <p className="text-[11px] leading-relaxed opacity-70">{stadium.paceTip}</p>
                    </div>

                    <div className="p-4 rounded-2xl bg-purple-500/5 border border-purple-500/10 border-l-4 border-l-purple-500/50 hover:bg-purple-500/10 transition-colors">
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs">🌀</span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-purple-500/70">Spin Tip</span>
                        </div>
                        <p className="text-[11px] leading-relaxed opacity-70">{stadium.spinTip}</p>
                    </div>

                    <div className="p-4 rounded-2xl bg-green-500/5 border border-green-500/10 border-l-4 border-l-green-500/50 hover:bg-green-500/10 transition-colors">
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs">🏏</span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-green-500/70">Batting Tip</span>
                        </div>
                        <p className="text-[11px] leading-relaxed opacity-70">{stadium.battingTip}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
