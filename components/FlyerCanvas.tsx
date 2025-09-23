// FIX: Corrected typo in React import to properly import forwardRef.
import React, { forwardRef } from 'react';
import type { DayBoxData, Logo, Palette, Slogan, GenerationStatus } from '../types';
import { SloganStyle } from '../types';
import DayBox from './DayBox';

interface FlyerCanvasProps {
  background: { image: string; blur: number; brightness: number };
  dayBoxes: DayBoxData[];
  allLogos: Logo[];
  slogan: Slogan;
  logoScale: number;
  onDayBoxClick: (dayId: string) => void;
  palette: Palette;
  generationStatus: GenerationStatus;
}

const getSloganStyle = (slogan: Slogan, palette: Palette): React.CSSProperties => {
    const base: React.CSSProperties = {
        fontFamily: `'${slogan.fontFamily}', sans-serif`,
        fontWeight: 900,
        textAlign: 'center',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        wordBreak: 'break-word',
        padding: '0 1rem',
    };
    switch(slogan.style) {
        case SloganStyle.Neon:
            return {
                ...base,
                color: '#FFFFFF',
                textShadow: `0 0 5px #fff, 0 0 10px #fff, 0 0 20px ${palette.accent}, 0 0 30px ${palette.accent}, 0 0 40px ${palette.accent}, 0 0 55px ${palette.accent}, 0 0 75px ${palette.accent}`
            };
        case SloganStyle.Outline:
            return {
                ...base,
                color: 'transparent',
                WebkitTextStroke: `2px ${palette.primary}`,
            };
        case SloganStyle.ThreeD:
            return {
                ...base,
                color: palette.primary,
                textShadow: `3px 3px 0px ${palette.accent}`
            };
         case SloganStyle.Glitch:
            return {
                ...base,
                color: '#FFFFFF',
                textShadow: `2px 2px 0px ${palette.accent}, -2px -2px 0px ${palette.primary}`
            };
        case SloganStyle.Gradient:
            return {
                ...base,
                background: `linear-gradient(45deg, ${palette.primary}, ${palette.accent})`,
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
            };
        case SloganStyle.Default:
        default:
            return {
                ...base,
                color: palette.primary,
            };
    }
}

// This logic is more balanced and ensures a maximum of 3 rows.
const getLogoGridLayout = (count: number): { cols: number } => {
  if (count === 0) return { cols: 1 };
  if (count <= 5) return { cols: count }; // 1 row for up to 5 logos
  if (count <= 10) return { cols: Math.ceil(count / 2) }; // 2 rows for 6-10 logos
  return { cols: Math.ceil(count / 3) }; // 3 rows for anything > 10
};


const FlyerCanvas = forwardRef<HTMLDivElement, FlyerCanvasProps>(
  ({ background, dayBoxes, allLogos, slogan, logoScale, onDayBoxClick, palette, generationStatus }, ref) => {
    const hasBackgroundImage = background.image && background.image.startsWith('data:');
    
    const dayBoxCount = dayBoxes.length;
    const layoutClassName = dayBoxCount <= 3 
      ? 'flex flex-col gap-2 w-full' 
      : 'grid grid-cols-2 gap-2 w-full';

    // Find the max number of logos in any box to standardize grid size
    const maxLogos = Math.max(0, ...dayBoxes.map(box => box.logoIds.length));
    const { cols: globalCols } = getLogoGridLayout(maxLogos);

        // Estado local para almacenar las escalas medidas por cada DayLabel
        const [measuredLabelScales, setMeasuredLabelScales] = React.useState<Record<string, number>>({});

        // Callback que cada DayBox llamará al medir su DayLabel localmente
        const handleLabelMeasured = (dayId: string, scale: number) => {
            setMeasuredLabelScales(prev => {
                if (!dayId) return prev;
                if (prev[dayId] === scale) return prev;
                return { ...prev, [dayId]: scale };
            });
        };

        // Calcular la escala mínima entre las mediciones existentes; si no hay mediciones, undefined
        const measuredValues = Object.values(measuredLabelScales).filter((v): v is number => typeof v === 'number' && isFinite(v));
        const minMeasuredScale: number | undefined = measuredValues.length > 0 ? Math.min(...measuredValues) : undefined;

        return (
            <div 
                ref={ref} 
                className="w-[360px] h-[640px] md:w-[405px] md:h-[720px] lg:w-[450px] lg:h-[800px] bg-center relative overflow-hidden shadow-2xl flex flex-col justify-center items-center rounded-2xl"
                style={{ 
                        backgroundColor: hasBackgroundImage ? 'transparent': '#111827'
                }}
            >
        {hasBackgroundImage && (
            <>
                <div
                    className="absolute inset-0 w-full h-full bg-cover bg-center"
                    style={{
                        backgroundImage: `url(${background.image})`,
                        filter: `blur(${background.blur}px)`,
                        transform: 'scale(1.05)', // Avoid blurred edges
                    }}
                />
                <div 
                    className="absolute inset-0 w-full h-full bg-black"
                    style={{
                        opacity: 1 - (background.brightness / 100)
                    }}
                />
            </>
        )}

        {generationStatus !== 'idle' && (
             <div className="absolute inset-0 bg-slate-900/80 flex flex-col items-center justify-center z-20 backdrop-blur-xl transition-opacity duration-300">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-400 mb-4"></div>
                <p className="text-lg font-semibold text-white tracking-wider">
                    {generationStatus === 'generating_image' ? 'Generando Imagen...' : 'Analizando Colores...'}
                </p>
            </div>
        )}

    <div className="relative z-10 w-full h-full flex flex-col items-center justify-center flex-grow p-1.5" style={{ transform: 'translateY(-6px)' }}>
        <div className={layoutClassName} style={{ marginTop: '-6px' }}>
                {dayBoxes.map(box => (
                    <DayBox
                        key={box.id}
                        dayId={box.id}
                        dayName={box.dayName}
                        logos={allLogos.filter(logo => box.logoIds.includes(logo.id))}
                        logoScale={logoScale}
                        onClick={() => onDayBoxClick(box.id)}
                        palette={palette}
                        gridCols={globalCols}
                        onLabelMeasured={handleLabelMeasured}
                        // Si ya tenemos una mínima medida, la forzamos en todas las DayLabel
                        labelOverrideScale={minMeasuredScale}
                    />
                ))}
            </div>
        
            <div className="relative w-full mt-3 shrink-0" style={{ transform: 'translateY(-6px)' }}>
                <h2 style={{ fontSize: `${slogan.fontSize}px`, ...getSloganStyle(slogan, palette) }}>{slogan.text}</h2>
            </div>
        </div>
      </div>
    );
  }
);

FlyerCanvas.displayName = 'FlyerCanvas';
export default FlyerCanvas;