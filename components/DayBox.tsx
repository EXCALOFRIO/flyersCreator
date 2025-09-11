import React, { useState, useEffect } from 'react';
import type { Logo, Palette } from '../types';

interface DayBoxProps {
  dayName: string;
  logos: Logo[];
  logoScale: number;
  onClick: () => void;
  palette: Palette;
  gridCols: number;
}

const DayBox: React.FC<DayBoxProps> = ({ dayName, logos, logoScale, onClick, palette, gridCols }) => {
  const cols = gridCols > 0 ? gridCols : 1;

  // Per-logo UI state (size multiplier, selected flag, highlight color)
  const [uiState, setUiState] = useState<Record<string, { size: number; selected: boolean; color?: string }>>({});

  // Initialize state for logos when they change
  useEffect(() => {
    setUiState(prev => {
      const next: typeof prev = { ...prev };
      // add defaults for any new logos
      for (const l of logos) {
        if (!next[l.id]) next[l.id] = { size: 1, selected: false, color: undefined };
      }
      // remove entries for logos that no longer exist
      for (const k of Object.keys(next)) {
        if (!logos.find(l => l.id === k)) delete next[k];
      }
      return next;
    });
  }, [logos]);

  // Listen for global clear-selection event so parent can force-deselect before export
  useEffect(() => {
    const handler = () => {
      setUiState(prev => {
        const next: typeof prev = { ...prev };
        for (const k of Object.keys(next)) next[k] = { ...next[k], selected: false };
        return next;
      });
    };
    window.addEventListener('clearLogoSelection', handler as EventListener);
    return () => window.removeEventListener('clearLogoSelection', handler as EventListener);
  }, []);

  const toggleSelect = (logoId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // prevent dayBox onClick
    setUiState(prev => {
      const cur = prev[logoId] || { size: 1, selected: false, color: undefined };
      // If currently not selected -> select this and deselect others
      if (!cur.selected) {
        const next: typeof prev = {} as any;
        for (const k of Object.keys(prev)) {
          next[k] = { ...prev[k], selected: false };
        }
        next[logoId] = { ...cur, selected: true, color: palette.accent || '#ff0' };
        return next;
      }
      // If it was selected, deselect it (no selection)
      return { ...prev, [logoId]: { ...cur, selected: false } };
    });
  };

  const changeSize = (logoId: string, delta: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setUiState(prev => {
      const cur = prev[logoId] || { size: 1, selected: false, color: undefined };
      const newSize = Math.min(2.5, Math.max(0.4, +(cur.size + delta).toFixed(2)));
      return { ...prev, [logoId]: { ...cur, size: newSize } };
    });
  };

  const logoChunks: Logo[][] = [];
  if (logos.length > 0) {
    const logosPerRow = cols;
    for (let i = 0; i < logos.length; i += logosPerRow) {
      logoChunks.push(logos.slice(i, i + logosPerRow));
    }
  }

  return (
    <div 
      className="p-0 rounded-lg group transition-all duration-300 relative h-44 backdrop-blur-lg"
      onClick={onClick}
      style={{ backgroundColor: `${palette.primary}1A` }}
    >
      <div 
        className="absolute -inset-px rounded-lg bg-gradient-to-r from-violet-500/50 to-fuchsia-500/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{'--glow-color': palette.accent} as React.CSSProperties}
      ></div>
      <div className="relative w-full h-full rounded-md flex flex-row items-stretch gap-0 p-1">
        <div className="flex items-center justify-center px-1">
          <h3 
              className="font-black text-xl uppercase tracking-[0.4em]"
              style={{ 
                  writingMode: 'vertical-rl', 
                  textOrientation: 'mixed', 
                  transform: 'rotate(180deg)',
                  color: palette.primary
              }}
          >
            {dayName}
          </h3>
        </div>
        <div className="flex-1 min-w-0">
            {logos.length > 0 ? (
              <div className="flex flex-col justify-center h-full w-full">
                  {logoChunks.map((chunk, rowIndex) => (
            <div key={rowIndex} className="flex justify-center items-center flex-1 min-h-0">
                          {chunk.map(logo => {
                            const state = uiState[logo.id] || { size: 1, selected: false, color: undefined };
                            const wrapperStyle: React.CSSProperties = {
                              width: `${100 / cols}%`,
                              display: 'flex',
                              justifyContent: 'center',
                              alignItems: 'center',
                              position: 'relative'
                            };
                            const highlightStyle: React.CSSProperties = state.selected ? {
                              boxShadow: `0 0 0 3px ${state.color || palette.accent}66, 0 6px 18px ${state.color || palette.accent}33`,
                              borderRadius: 8,
                            } : {};

                            return (
                              <div key={logo.id} className="flex justify-center items-center relative p-0" style={wrapperStyle}>
                                  <div
                                    onClick={(e) => toggleSelect(logo.id, e)}
                                    className="relative flex items-center justify-center cursor-pointer"
                                    style={{ padding: 4, ...highlightStyle }}
                                  >
                                    <img 
                                        src={logo.dataUrl} 
                                        alt={logo.name} 
                                        className="object-contain max-h-full max-w-full"
                                        style={{ 
                                          transform: `scale(${logoScale * (state.size || 1)})`,
                                          transition: 'transform 120ms linear',
                                          display: 'block'
                                        }}
                                        draggable="false"
                                    />

                                    {/* Size controls - visible when selected */}
                                    {state.selected && (
                                      <div className="absolute right-1 top-1 flex flex-col gap-1 z-20">
                                        <button onClick={(e) => changeSize(logo.id, 0.1, e)} className="w-6 h-6 bg-black/60 text-white rounded-full text-xs flex items-center justify-center">+</button>
                                        <button onClick={(e) => changeSize(logo.id, -0.1, e)} className="w-6 h-6 bg-black/60 text-white rounded-full text-xs flex items-center justify-center">−</button>
                                      </div>
                                    )}
                                  </div>
                              </div>
                            );
                          })}
                      </div>
                  ))}
              </div>
            ) : (
               <div className="flex items-center justify-center h-full text-slate-400 text-sm opacity-80">Haz clic para añadir logos</div>
            )}
        </div>
      </div>
    </div>
  );
};

export default DayBox;