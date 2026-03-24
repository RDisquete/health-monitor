"use client";

import { useState } from 'react';
import { Site, HealthCheck } from '@/types/validator';

interface Props {
  sites: Site[];
  avgLatency: number;
  systemStatus: string;
}

const SunIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
);

const MoonIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
);

export default function ClientWrapper({ sites, avgLatency, systemStatus }: Props) {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);

  const theme = {
    bg: isDarkMode ? 'bg-[#050505]' : 'bg-[#f8f9fa]',
    text: isDarkMode ? 'text-zinc-500' : 'text-slate-600',
    card: isDarkMode ? 'bg-zinc-900/20 border-zinc-800/80 hover:border-blue-500/40' : 'bg-white border-slate-200 shadow-xl shadow-slate-200/40 hover:border-blue-200',
    title: isDarkMode ? 'text-zinc-100' : 'text-slate-900',
    accent: 'text-blue-500'
  };

  return (
    <main className={`min-h-screen transition-colors duration-500 font-sans relative overflow-hidden ${theme.bg} ${theme.text}`}>
      {/* Background Grid - Corregido bg-size */}
      <div className={`absolute inset-0 opacity-[0.02] pointer-events-none ${isDarkMode ? 'bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-size-[24px_24px]' : 'bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] bg-size-[16px_16px]'}`} />

      <div className="max-w-7xl mx-auto p-8 lg:p-16 relative z-10">
        
        <header className="mb-24 relative">
          <div className={`h-px w-full mb-8 opacity-10 ${isDarkMode ? 'bg-white' : 'bg-black'}`} />
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-10">
            <div>
              <span className="text-[10px] font-mono tracking-[0.4em] uppercase opacity-30 mb-4 block underline decoration-blue-500/50 underline-offset-4">System_Node_Authorization // rdiquete</span>
              <h1 className={`text-8xl font-black tracking-tighter leading-none transition-colors ${theme.title}`}>
                INFRA<span className={theme.accent}>.</span>RD
              </h1>
              <div className="flex items-center gap-4 mt-6">
                <div className={`h-2.5 w-2.5 rounded-full ${systemStatus === 'NOMINAL' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]' : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]'}`} />
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] opacity-40">
                  Status: <span className={systemStatus === 'NOMINAL' ? 'text-emerald-400' : 'text-red-400'}>{systemStatus}</span>
                </p>
              </div>
            </div>

            <div className="flex flex-col items-start md:items-end gap-6">
              <div className="flex gap-12 border-r border-zinc-800 pr-8 py-2">
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase opacity-20 tracking-widest mb-2">Net_Latency_Avg</p>
                  <p className={`text-4xl font-mono font-light leading-none ${isDarkMode ? 'text-blue-500' : 'text-blue-600'}`}>
                    {avgLatency}<span className="text-sm ml-1 opacity-30">ms</span>
                  </p>
                </div>
              </div>

              <button 
                onClick={() => setIsDarkMode(!isDarkMode)}
                className={`group flex items-center gap-4 px-5 py-2 rounded-md border transition-all cursor-pointer ${
                  isDarkMode ? 'bg-transparent border-zinc-800 text-zinc-500 hover:text-zinc-200 hover:border-zinc-700' : 'bg-white border-slate-200 text-slate-500 shadow-sm'
                }`}
              >
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">{isDarkMode ? 'MODE_NIGHT' : 'MODE_DAY'}</span>
                {isDarkMode ? <SunIcon /> : <MoonIcon />}
              </button>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {sites.map((site) => {
            const checks = site.health_checks?.slice(-40) || [];
            const lastCheck = checks[checks.length - 1];
            const isUp = lastCheck?.status_code === 200;
            const localMax = Math.max(...checks.map(c => c.latency || 0), 1);

            return (
              <div 
                key={site.id} 
                onClick={() => setSelectedSite(site)}
                className={`group rounded-none p-10 border transition-all duration-300 hover:bg-zinc-900/2 cursor-pointer relative ${theme.card}`}
              >
                <div className="flex justify-between items-start mb-16 relative z-10">
                  <div>
                    <h2 className={`text-2xl font-black tracking-tight mb-1 uppercase ${theme.title}`}>{site.name}</h2>
                    <p className="text-[10px] font-mono opacity-20 tracking-widest uppercase italic">{site.url}</p>
                  </div>
                  <div className={`text-[9px] font-black px-3 py-1 border ${
                    isUp ? 'bg-transparent text-emerald-500 border-emerald-500/30' : 'bg-red-500/10 text-red-500 border-red-500/50'
                  }`}>
                    {isUp ? 'STS: OK' : 'STS: ERR'}
                  </div>
                </div>

                <div className="flex items-end gap-0.75 h-20 mb-12 px-1 border-b border-zinc-800/50">
                  {checks.map((c: HealthCheck, i: number) => {
                    const height = ((c.latency || 0) / localMax) * 100;
                    const isError = c.status_code !== 200;
                    
                    return (
                      <div 
                        key={i} 
                        className={`flex-1 transition-all duration-300 ${
                          isError 
                            ? 'bg-red-600' 
                            : isDarkMode 
                              ? 'bg-blue-600/40 group-hover:bg-blue-500' 
                              : 'bg-blue-400'
                        }`}
                        style={{ height: `${Math.max(height, 2)}%` }}
                      />
                    );
                  })}
                </div>

                <div className="flex justify-between items-end relative z-10">
                  <div className="flex gap-10">
                    <div>
                      <span className="text-[9px] font-black uppercase opacity-20 tracking-[0.2em] block mb-2">Ms_Response</span>
                      <p className={`text-4xl font-mono font-medium tabular-nums ${isDarkMode ? 'text-zinc-200' : 'text-slate-800'}`}>
                        {lastCheck?.latency || '00'}<span className="text-xs opacity-20 ml-1">ms</span>
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-[9px] font-black opacity-0 group-hover:opacity-40 transition-opacity tracking-[0.3em] uppercase">
                    [ Open_Module ]
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MODAL AMPLIADO */}
      {selectedSite && (() => {
        const checks = selectedSite.health_checks?.slice(-60) || [];
        const latencies = checks.map(c => c.latency || 0);
        const maxLatency = Math.max(...latencies, 1);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-black/95 cursor-pointer" onClick={() => setSelectedSite(null)} />
            <div className={`relative w-full max-w-5xl border shadow-2xl p-12 sm:p-20 transition-all ${isDarkMode ? 'bg-[#080808] border-zinc-800' : 'bg-white border-slate-200'}`}>
              <div className="flex justify-between items-start mb-20">
                <div>
                  <span className="text-[10px] font-mono text-blue-500 uppercase tracking-[0.5em] mb-4 block">Detail_Diagnostic_Buffer</span>
                  <h3 className={`text-7xl font-black tracking-tighter uppercase ${theme.title}`}>{selectedSite.name}</h3>
                </div>

              </div>

              <div className="flex items-end gap-1 h-72 bg-zinc-900/10 rounded-none p-4 mb-20 border border-zinc-800/50">
                {checks.map((c: HealthCheck, i: number) => {
                  const height = ((c.latency || 0) / maxLatency) * 100;
                  return (
                    <div 
                      key={i} 
                      className={`flex-1 transition-all ${c.status_code === 200 ? 'bg-blue-600/60 hover:bg-blue-500' : 'bg-red-600'}`}
                      style={{ height: `${Math.max(height, 1)}%` }}
                    />
                  );
                })}
              </div>

              <div className="grid grid-cols-3 gap-16">
                  <div className="text-left border-t border-zinc-800 pt-6">
                    <span className="block text-[10px] font-black uppercase opacity-20 mb-4 tracking-widest italic">{`// Peak_Buffer`}</span>
                    <span className="text-5xl font-mono font-medium">{maxLatency}<span className="text-lg opacity-20 ml-2 font-light">ms</span></span>
                  </div>
                  <div className="text-left border-t border-zinc-800 pt-6">
                    <span className="block text-[10px] font-black uppercase opacity-20 mb-4 tracking-widest italic">{`// Logic_Status`}</span>
                    <span className="text-5xl font-mono font-medium text-emerald-500/80">NOMINAL</span>
                  </div>
                  <div className="text-left border-t border-zinc-800 pt-6">
                    <span className="block text-[10px] font-black uppercase opacity-20 mb-4 tracking-widest italic">{`// Data_Uptime`}</span>
                    <span className="text-5xl font-mono font-medium italic">100<span className="text-lg opacity-20 ml-1">%</span></span>
                  </div>
              </div>
            </div>
          </div>
        );
      })()}
    </main>
  );
}