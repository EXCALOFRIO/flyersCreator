import React from 'react';
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
  
  const logoChunks: Logo[][] = [];
  if (logos.length > 0) {
      // Use the externally provided column count to chunk logos
      const logosPerRow = cols;
      for (let i = 0; i < logos.length; i += logosPerRow) {
          logoChunks.push(logos.slice(i, i + logosPerRow));
      }
  }
  
  return (
    <div 
      className="p-0 rounded-lg cursor-pointer group transition-all duration-300 relative h-44 backdrop-blur-lg"
      onClick={onClick}
      style={{ backgroundColor: `${palette.primary}1A` }}
    >
      <div 
        className="absolute -inset-px rounded-lg bg-gradient-to-r from-violet-500/50 to-fuchsia-500/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{'--glow-color': palette.accent} as React.CSSProperties}
      ></div>
      <div 
        className="relative w-full h-full rounded-md flex flex-row items-stretch gap-0 p-1"
      >
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
        
    <div 
      className="flex-1 min-w-0"
    >
            {logos.length > 0 ? (
              <div className="flex flex-col justify-center h-full w-full">
                  {logoChunks.map((chunk, rowIndex) => (
            <div key={rowIndex} className="flex justify-center items-center flex-1 min-h-0">
                          {chunk.map(logo => (
                <div key={logo.id} className="flex justify-center items-center relative p-0" style={{ width: `${100 / cols}%` }}>
                                  <img 
                                      src={logo.dataUrl} 
                                      alt={logo.name} 
                                      className="object-contain max-h-full max-w-full"
                                      style={{ 
                                        transform: `scale(${logoScale})`,
                                      }}
                                      draggable="false"
                                  />
                              </div>
                          ))}
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