import React, { useState, useEffect } from 'react';
import type { Logo, Palette } from '../types';

// Escala global fija para logos (requerido por el usuario)
const GLOBAL_LOGO_SCALE = 1.5;

// --- AJUSTES MANUALES DE TAMAÑO ---
const MANUAL_ADJUSTMENTS: Record<string, number> = {
  'art club': 1.05,
  'bonded club': 1,
  'casa madrid': 1,
  'casa suecia': 1.10,
  'chaman': 0.75,
  'club graf': 0.85,
  'condado club': 1,
  'bardot': 0.95,
  'chango': 1.4,
  'manama': 1.15,
  'etnia': 1.90,
  'la fira': 1.15,
  'fitz marbella': 0.5,
  'grace madrid': 1.20,
  'gran cafe el espejo': 0.9,
  'guss club': 1,
  'habanera': 1,
  'high club room': 0.65,
  'isla tortuga': 0.85,
  'julius club': 1.05,
  'karau': 1.05,
  'le chic': 1.15,
  'le club': 0.85,
  'lemon club': 0.95,
  'liberata': 1.1,
  'archy club': 1.10,
  'autocine': 0.85,
  'b12 madrid': 0.70,
  'cats': 0.80,
  'copernico': 1.50,
  'mon madrid': 0.80,
  'nazca': 0.85,
  'oh my club': 0.7,
  'epoka the club': 1,
  'fabrik': 0.85,
  'fitz club': 0.5,
  'florida park': 0.85,
  'fortuny': 0.9,
  'gunilla': 1.10,
  'jowke': 0.85,
  'teatro kapital': 1.10,
  'kumarah': 1.2,
  'lab the club': 0.85,
  'la riviera': 1.05,
  'la santa': 1,
  'meneo': 1,
  'panda club': 0.85,
  'posh club': 0.8,
  'shoko madrid': 1,
  'teatro barcelo': 0.75,
  'the marvel': 0.85,
  "tiffanys": 1,
  'vandido': 1,
  'vanity': 0.8,
  'zoe': 1.15,
  'maffia the club': 1,
  'marabu': 0.8,
  'marieta': 1.15,
  'muy bendito': 1.05,
  'padreo': 0.95,
  'perrachica': 0.85,
  'but': 0.9,
  'sala de despecho': 1.05,
  'bahia': 0.8,
  'hipodromo zarzuela': 0.85,
  'the basement': 1,
  'the garden': 1.15,
  'vyta club': 1.10,
};

// --- LISTA MANUAL DE LOGOS ANCHOS (LANDSCAPE) ---
const MANUAL_LONG: Record<string, boolean> = {
  'art club': true,
  'bardot': true,
  'bonded club': true,
  'casa madrid': true,
  'chango': true,
  'condado club': true,
  'copernico': true,
  'etnia': true,
  'fitz marbella': true,
  'gran cafe el espejo': true,
  'habanera': true,
  'hipodromo zarzuela': true,
  'karau': true,
  'kumarah': true,
  'la fira': true,
  'la riviera': true,
  'le club': true,
  'liberata': true,
  'manama': true,
  'posh club': true,
  'shoko madrid': true,
  'the basement': true,
  'the garden': true,
  "tiffanys": true,
  'vandido': true,
  'vyta club': true,
};

const normalizeNameKey = (s: string) => {
  if (!s) return '';
  s = s.replace(/\.(png|jpg|jpeg|svg)$/i, '');
  try {
    s = s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  } catch (e) {
    s = s.replace(/[\u0300-\u036f]/g, '');
  }
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
};

interface DayBoxProps {
  dayName: string;
  logos: Logo[];
  logoScale: number;
  onClick: () => void;
  palette: Palette;
  gridCols: number;
}

const DayBox: React.FC<DayBoxProps> = ({ dayName, logos, logoScale, onClick, palette, gridCols }) => {
  const [uiState, setUiState] = useState<Record<string, { size: number; selected: boolean; color?: string; normalizedScale?: number; isWide?: boolean; bboxW?: number; bboxH?: number }>>({});

  useEffect(() => {
    // Sincronizar estado de la UI con la lista de logos
    setUiState(prev => {
      const next: typeof prev = {};
      for (const l of logos) {
        next[l.id] = prev[l.id] || { size: 1, selected: false, normalizedScale: 1, isWide: false };
      }
      return next;
    });
  }, [logos]);

  useEffect(() => {
    // Calcular escalas y si son anchos
    let cancelled = false;
    (async () => {
      if (!logos || logos.length === 0) return;
      // ... (El resto de este useEffect no necesita cambios, se mantiene igual)
       try {
        const results: { id: string; bboxMax: number; fallbackMax: number; bboxW?: number; bboxH?: number }[] = [];
        for (const logo of logos) {
          try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = logo.dataUrl;
            await new Promise<void>((res) => { img.onload = () => res(); img.onerror = () => res(); });
            const w = img.naturalWidth || 128;
            const h = img.naturalHeight || 128;
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) { results.push({ id: logo.id, bboxMax: Math.max(w, h), fallbackMax: Math.max(w, h), bboxW: w, bboxH: h }); continue; }
            try {
              ctx.clearRect(0, 0, w, h);
              ctx.drawImage(img, 0, 0, w, h);
              const imgData = ctx.getImageData(0, 0, w, h).data;
              let minX = w, minY = h, maxX = 0, maxY = 0;
              const alphaThreshold = 12;
              for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                  const idx = (y * w + x) * 4 + 3;
                  if (imgData[idx] > alphaThreshold) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                  }
                }
              }
              if (maxX < minX || maxY < minY) {
                results.push({ id: logo.id, bboxMax: Math.max(w, h), fallbackMax: Math.max(w, h), bboxW: w, bboxH: h });
              } else {
                const bboxW = maxX - minX + 1;
                const bboxH = maxY - minY + 1;
                results.push({ id: logo.id, bboxMax: Math.max(bboxW, bboxH), fallbackMax: Math.max(w, h), bboxW, bboxH });
              }
            } catch (err) {
              results.push({ id: logo.id, bboxMax: Math.max(w, h), fallbackMax: Math.max(w, h), bboxW: w, bboxH: h });
            }
          } catch (err) {
            results.push({ id: logo.id, bboxMax: 128, fallbackMax: 128 });
          }
        }

        if (cancelled) return;

        const sizes = results.map(r => r.bboxMax || r.fallbackMax || 1).filter(Boolean);
        if (sizes.length === 0) return;
        const sorted = [...sizes].sort((a, b) => a - b);
        const median = sorted[Math.floor((sorted.length - 1) / 2)];

        setUiState(prev => {
          const next: typeof prev = { ...prev };
          for (const r of results) {
            const cur = next[r.id] || { size: 1, selected: false, normalizedScale: 1, isWide: false };
            const raw = r.bboxMax || r.fallbackMax || 1;
            let scale = median > 0 ? Math.max(0.6, Math.min(1.9, median / raw)) : 1;
            const logoKey = normalizeNameKey(r.id || '');
            let manual: number | undefined = MANUAL_ADJUSTMENTS[logoKey];
            if (manual === undefined) {
              const keys = Object.keys(MANUAL_ADJUSTMENTS);
              for (const k of keys) {
                if (!k) continue;
                if (logoKey.includes(k) || k.includes(logoKey)) { manual = MANUAL_ADJUSTMENTS[k]; break; }
                const mTokens = k.split(/\s+/).filter(Boolean);
                const lTokens = logoKey.split(/\s+/).filter(Boolean);
                if (mTokens.length > 0) {
                  let matchCount = 0;
                  for (const t of mTokens) if (lTokens.includes(t)) matchCount++;
                  if (matchCount > 0 && matchCount / mTokens.length >= 0.5) { manual = MANUAL_ADJUSTMENTS[k]; break; }
                }
              }
            }
            if (typeof manual === 'number') scale = +(scale * manual).toFixed(3);
            
            const isWideAuto = (r.bboxW && r.bboxH) ? (r.bboxW / Math.max(1, r.bboxH) > 1.35) : false;
            const isWideManual = MANUAL_LONG[logoKey];
            const isWide = isWideManual === true || (isWideManual !== false && isWideAuto);

            next[r.id] = { ...cur, normalizedScale: scale, isWide, bboxW: r.bboxW, bboxH: r.bboxH };
          }
          return next;
        });
      } catch (err) {
        console.warn('Error normalizing logo scales', err);
      }
    })();
    return () => { cancelled = true; };
  }, [logos]);

  useEffect(() => {
    // Limpiar selección de logos
    const handler = () => setUiState(p => { const n = { ...p }; for (const k in n) n[k] = { ...n[k], selected: false }; return n; });
    window.addEventListener('clearLogoSelection', handler as EventListener);
    return () => window.removeEventListener('clearLogoSelection', handler as EventListener);
  }, []);

  const toggleSelect = (logoId: string, e: React.MouseEvent) => { e.stopPropagation(); setUiState(p => { const c = p[logoId] || { size: 1, selected: false }; if (!c.selected) { const n = {}; for (const k of Object.keys(p)) n[k] = { ...p[k], selected: false }; n[logoId] = { ...c, selected: true, color: palette.accent || '#ff0' }; return n; } return { ...p, [logoId]: { ...c, selected: false } }; }); };
  const changeSize = (logoId: string, delta: number, e: React.MouseEvent) => { e.stopPropagation(); setUiState(p => { const c = p[logoId] || { size: 1, selected: false }; const n = Math.min(1.6, Math.max(0.5, +(c.size + delta).toFixed(2))); return { ...p, [logoId]: { ...c, size: n } }; }); };
  const partitionLogoRows = (n: number, maxRows = 3): number[] => { if (n <= 0) return []; const r = Math.min(maxRows, Math.max(1, Math.ceil(n / 4))); const b = Math.floor(n / r); const rem = n % r; const a = []; for (let i = 0; i < r; i++) a.push(b + (i < rem ? 1 : 0)); return a; };

  const createBalancedChunks = (allLogos: Logo[], state: typeof uiState): Logo[][] => {
    if (!allLogos.length || !Object.keys(state).length) return [];
    const wideLogos = allLogos.filter(l => state[l.id]?.isWide);
    const narrowLogos = allLogos.filter(l => !state[l.id]?.isWide);
    const rowCounts = partitionLogoRows(allLogos.length, 3);
    const chunks = rowCounts.map(capacity => ({ capacity, logos: [] as Logo[] }));
    while (wideLogos.length > 0) {
      const targetChunk = chunks.filter(c => c.logos.length < c.capacity).sort((a, b) => { const wA = a.logos.filter(l => state[l.id]?.isWide).length; const wB = b.logos.filter(l => state[l.id]?.isWide).length; if (wA !== wB) return wA - wB; return b.capacity - a.capacity; })[0];
      if (targetChunk) targetChunk.logos.push(wideLogos.shift()!); else break;
    }
    const remainingLogos = [...narrowLogos, ...wideLogos];
    for (const chunk of chunks) {
      while (chunk.logos.length < chunk.capacity && remainingLogos.length > 0) {
        chunk.logos.push(remainingLogos.shift()!);
      }
    }
    return chunks.map(c => c.logos);
  };

  const interleaveRow = (chunk: Logo[]): Logo[] => {
    const wide = chunk.filter(l => uiState[l.id]?.isWide);
    const narrow = chunk.filter(l => !uiState[l.id]?.isWide);
    if (wide.length === 0 || narrow.length === 0) return chunk;
    const result: Logo[] = [];
    let turn = wide.length > narrow.length ? 'wide' : 'narrow';
    while (wide.length || narrow.length) {
      if (turn === 'wide' && wide.length) { result.push(wide.shift()!); turn = 'narrow'; }
      else if (turn === 'narrow' && narrow.length) { result.push(narrow.shift()!); turn = 'wide'; }
      else { turn = turn === 'wide' ? 'narrow' : 'wide'; }
    }
    return result;
  };

  const logoChunks = createBalancedChunks(logos, uiState);
  const interleavedRows = logoChunks.map(chunk => interleaveRow(chunk));
  const maxCount = Math.max(1, ...interleavedRows.map(r => r.length));
  
  return (
    <div className="p-0 pt-4 rounded-lg group transition-all duration-300 relative h-40 backdrop-blur-lg" onClick={onClick} style={{ backgroundColor: `${palette.primary}1A` }}>
      <div className="absolute -inset-px rounded-lg bg-gradient-to-r from-violet-500/50 to-fuchsia-500/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{'--glow-color': palette.accent} as React.CSSProperties}></div>
  <div className="relative w-full h-full rounded-md flex flex-row items-stretch gap-0 p-0">
  <div className="flex items-start justify-center pl-0 pr-4 pt-2">
          <h3 className="font-black text-xl uppercase tracking-[0.4em]" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)', color: palette.primary }}>
            {dayName}
          </h3>
        </div>
  <div className="flex-1 min-w-0">
          {logos.length > 0 ? (
            <div className="flex flex-col justify-end h-full w-full pb-1">
              {interleavedRows.map((interleaved, rowIndex) => {
                // --- CAMBIO CLAVE ---
                // Determina la clase de justificación dinámicamente.
                // Si la fila tiene menos logos que la más larga, usa 'justify-around' para espaciarlos.
                const isFullRow = interleaved.length >= maxCount;
                const rowJustifyClass = isFullRow ? 'justify-center' : 'justify-around';
                const normalizedCellWidth = 100 / interleaved.length; // Ancho de celda basado en la fila actual

                return (
                  <div key={rowIndex} className={`flex ${rowJustifyClass} items-center flex-1 min-h-0`}>
                    {interleaved.map((logo, i) => {
                      const state = uiState[logo.id] || { size: 1, selected: false, isWide: false };
                      const rawNormalized = state.normalizedScale || 1;
                      // Forzar escala global fija en lugar de usar la prop `logoScale`
                      const displayScale = Math.min(2.2, Math.max(0.55, GLOBAL_LOGO_SCALE * (state.size || 1) * rawNormalized));
                      // Usamos el ancho de celda de la fila actual para que ocupen todo el espacio
                      const wrapperStyle: React.CSSProperties = { width: `${normalizedCellWidth}%`, height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', transition: 'margin 150ms ease' };
                      const left = interleaved[i - 1], right = interleaved[i + 1];
                      if (state.selected) { wrapperStyle.marginLeft = 6; wrapperStyle.marginRight = 6; (wrapperStyle as any).zIndex = 40; }
                      else if (left && uiState[left.id]?.selected) { wrapperStyle.marginLeft = 12; }
                      else if (right && uiState[right.id]?.selected) { wrapperStyle.marginRight = 12; }
                      const highlightStyle: React.CSSProperties = state.selected ? { boxShadow: `0 0 0 3px ${state.color || palette.accent}66, 0 6px 18px ${state.color || palette.accent}33`, borderRadius: 8 } : {};
                      
                      return (
                        <div key={logo.id} style={wrapperStyle}>
                          {/* Ajuste: Aumentamos un poco el padding interno para dar más aire al logo */}
                          <div onClick={(e) => toggleSelect(logo.id, e)} className="relative flex items-center justify-center cursor-pointer w-full h-full p-1" style={{ ...highlightStyle }}>
                            <img src={logo.dataUrl} alt={logo.name} draggable="false" style={{ display: 'block', objectFit: 'contain', width: '100%', height: '100%', transform: `scale(${displayScale})`, transformOrigin: 'center', transition: 'transform 120ms linear', pointerEvents: 'none' }} />
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
                );
              })}
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