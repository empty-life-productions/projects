'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function Home() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <main className="min-h-screen relative overflow-hidden" style={{ background: 'var(--color-bg-primary)' }}>
      {/* Dynamic Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full opacity-20 animate-pulse"
          style={{ background: 'radial-gradient(circle, var(--color-gold) 0%, transparent 70%)', filter: 'blur(100px)' }} />
        <div className="absolute bottom-[-5%] right-[-5%] w-[30%] h-[30%] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, var(--color-gold-dark) 0%, transparent 70%)', filter: 'blur(80px)' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full opacity-[0.03]"
          style={{ backgroundImage: 'radial-gradient(circle, var(--color-gold) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      </div>

      {/* Top Banner Marquee */}
      <div className="relative z-20 marquee-container mt-0">
        <div className="marquee-content">
          {[1, 2, 3, 4].map((i) => (
            <span key={i} className="marquee-item">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-gold)]" />
              IPL 2026 AUCTION POOL LIVE
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-gold)]" />
              120 CR PURSE LIMIT
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-gold)]" />
              NEW PLAYER RATINGS LIVE
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-gold)]" />
              REAL-TIME SIMULATION
            </span>
          ))}
        </div>
      </div>

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 -mt-12">
        <div className={`text-center max-w-5xl mx-auto transition-all duration-1000 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
          {/* Badge */}
          <div className="inline-flex items-center gap-2 mb-10 px-5 py-2.5 rounded-full glass-panel border-gold animate-fadeInUp">
            <div className="w-2 h-2 rounded-full animate-pulse bg-[var(--color-gold)]" />
            <span className="text-[10px] font-black tracking-[0.3em] uppercase gold-text">
              PREMIUM SEASON 2026 • DEFINITIVE EDITION
            </span>
          </div>

          {/* Title */}
          <div className="relative mb-6">
            <h1 className="text-8xl md:text-[10rem] font-black tracking-tighter mb-0 leading-none select-none">
              <span className="gold-text opacity-90">THE</span>{' '}
              <span className="text-white">DUGOUT</span>
            </h1>
            <div className="absolute -bottom-2 right-0 md:right-10 text-xs font-mono tracking-widest text-[var(--color-text-muted)] animate-slideIn">
              [V2.0.0_PRODUCTION]
            </div>
          </div>

          <p className="text-2xl md:text-3xl font-extralight mb-4 tracking-tight text-[var(--color-text-secondary)] italic">
            Where strategy meets simulation.
          </p>

          <p className="text-sm md:text-base max-w-2xl mx-auto mb-14 leading-relaxed text-[var(--color-text-muted)] font-medium">
            Take command in the most authentic IPL management experience. Direct 120 Cr auctions with RTM logic,
            deploy stadium-specific strategies, and watch our proprietary engine simulate every ball in stunning detail.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-20 animate-fadeInUp stagger-2">
            <Link href="/login" className="btn-primary px-12 py-5 text-base hover:scale-105 transition-transform duration-300">
              Enter Arena
            </Link>
            <Link href="#features" className="btn-secondary px-10 py-5 text-sm hover:border-[var(--color-gold)] transition-colors duration-300">
              Technical Overview
            </Link>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-3 gap-12 max-w-2xl mx-auto py-8 border-t border-b border-white/[0.05] glass-panel px-12">
            {[
              { value: '120Cr', label: 'Max Purse' },
              { value: '300+', label: 'Rated Stars' },
              { value: '10', label: 'Pro Teams' },
            ].map((stat, i) => (
              <div key={i} className={`text-center animate-float stagger-${i + 1}`}>
                <div className="text-3xl font-black gold-text mb-1">{stat.value}</div>
                <div className="text-[10px] tracking-[0.2em] font-bold text-[var(--color-text-muted)] uppercase">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Features Section */}
        <div id="features" className={`mt-40 max-w-7xl mx-auto w-full transition-all duration-1000 delay-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
          <div className="text-center mb-16">
            <h2 className="text-sm font-black tracking-[0.5em] uppercase mb-4 gold-text">
              PRO CORE ENGINE
            </h2>
            <div className="h-px w-20 bg-gradient-to-r from-transparent via-[var(--color-gold)] to-transparent mx-auto" />
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 text-left">
            {[
              {
                icon: '⚖️',
                title: 'Market Economy (120 Cr)',
                desc: 'Hyper-realistic auction engine with 120 Cr purse management and dynamic RTM (Right-to-Match) card logic.',
              },
              {
                icon: '🏟️',
                title: 'Stadium & Pitch Tech',
                desc: 'Unique behaviors across 10 venues. Pitch degradation, moisture levels, and stadium atmosphere affect simulation.',
              },
              {
                icon: '🤖',
                title: 'Smart Bot Commanders',
                desc: 'Advanced AI that strategically fills squads up to 85% density, targeting balanced team compositions.',
              },
              {
                icon: '🔄',
                title: 'Mixed Auction Sets',
                desc: 'Balanced set structure alternating between Batters, Bowlers, and All-Rounders in 8-player chunks.',
              },
              {
                icon: '🛡️',
                title: 'Capped Retention',
                desc: 'Professional player classification (Capped/Uncapped) based on international status for elite squad management.',
              },
              {
                icon: '📉',
                title: 'Proprietary Simulation',
                desc: 'Physics-based ball-by-ball simulation calculating trajectory, spin, and exit velocity for every delivery.',
              },
            ].map((feature, i) => (
              <div key={i} className="panel rounded-3xl border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-all duration-500 p-8">
                <div className="text-3xl mb-6">{feature.icon}</div>
                <h3 className="text-lg font-black mb-3 text-white uppercase tracking-tight">{feature.title}</h3>
                <p className="text-xs leading-relaxed text-[var(--color-text-secondary)] font-medium">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-40 pb-12 w-full text-center border-t border-white/[0.05]">
          <div className="max-w-7xl mx-auto px-6 pt-12 flex flex-col items-center">
            <div className="flex gap-8 mb-6 text-[10px] font-bold tracking-[0.2em] uppercase text-[var(--color-text-muted)]">
              <span className="hover:text-[var(--color-gold)] cursor-pointer transition-colors">Documentation</span>
              <span className="hover:text-[var(--color-gold)] cursor-pointer transition-colors">Privacy Policy</span>
              <span className="hover:text-[var(--color-gold)] cursor-pointer transition-colors">Server Status</span>
            </div>
            <p className="text-[10px] font-medium tracking-widest uppercase opacity-40">
              © 2026 THE DUGOUT • ADVANCED CRICKET MANAGEMENT SYSTEM
            </p>
          </div>
        </footer>
      </div>
    </main>
  );
}
