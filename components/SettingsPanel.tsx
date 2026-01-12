import React, { useRef } from 'react';
import type { Palette, Slogan, GenerationStatus, DayBoxData } from '../types';
import { SloganStyle } from '../types';

type Background = { image: string; blur: number; brightness: number };

// Días disponibles para seleccionar
const AVAILABLE_DAYS = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'];

// Presets de días comunes
const DAY_PRESETS = [
  { label: 'Jue-Sáb', days: ['JUEVES', 'VIERNES', 'SÁBADO'] },
  { label: 'Mié-Vie', days: ['MIÉRCOLES', 'JUEVES', 'VIERNES'] },
  { label: 'Vie-Dom', days: ['VIERNES', 'SÁBADO', 'DOMINGO'] },
];

interface SettingsPanelProps {
  background: Background;
  onBackgroundChange: (bg: Background) => void;
  slogan: Slogan;
  onSloganChange: (slogan: Slogan) => void;
  logoScale: number;
  onLogoScaleChange: (scale: number) => void;
  onExport: () => void;
  onExportProject?: () => void;
  palettes: Palette[];
  selectedPaletteIndex: number;
  onSelectPalette: (index: number) => void;
  generationStatus: GenerationStatus;
  onGenerateBackground: () => void;
  onCustomBackgroundUpload: (file: File) => void;
  dayBoxes: DayBoxData[];
  onDayBoxesChange: (dayBoxes: DayBoxData[]) => void;
}

const FONT_FAMILIES = ['Unbounded', 'Teko', 'Chakra Petch', 'Syncopate', 'Monoton', 'Audiowide', 'Rubik Mono One'];

const SettingsSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="border-b border-slate-800 pb-6 mb-6 last:border-b-0 last:pb-0 last:mb-0">
    <h3 className="font-bold mb-4 text-violet-300 text-sm uppercase tracking-wider font-display">{title}</h3>
    {children}
  </div>
);

const StyledRangeSlider: React.FC<{label: string, value: number, min: number, max: number, step?: number, onChange: (val: number) => void}> = ({label, value, min, max, step = 1, onChange}) => {
    const progress = ((value - min) / (max - min)) * 100;
    return (
        <div className="space-y-2">
            <label className="block text-sm text-slate-300">{label}: <span className="font-semibold text-white">{value.toFixed(step < 1 ? 1 : 0)}</span></label>
             <div 
                className="relative h-4 flex items-center"
                style={{'--progress': `${progress}%`} as React.CSSProperties}
            >
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => onChange(parseFloat(e.target.value))}
                    className="w-full h-1.5 appearance-none bg-transparent cursor-pointer group"
                />
                <div className="absolute top-1/2 left-0 -translate-y-1/2 w-full h-1.5 bg-slate-700 rounded-full pointer-events-none">
                    <div className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full" style={{width: `var(--progress)`}}></div>
                </div>
                 <div className="absolute top-1/2 -translate-y-1/2 -translate-x-2 w-4 h-4 bg-white rounded-full shadow pointer-events-none" style={{left: `var(--progress)`}}></div>
            </div>
        </div>
    );
};


const SettingsPanel: React.FC<SettingsPanelProps> = ({
  background, onBackgroundChange,
  slogan, onSloganChange,
  logoScale, onLogoScaleChange,
  onExport,
  onExportProject,
  palettes,
  selectedPaletteIndex, onSelectPalette,
  generationStatus, onGenerateBackground, onCustomBackgroundUpload,
  dayBoxes, onDayBoxesChange
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
          onCustomBackgroundUpload(file);
      }
      // Reset file input to allow uploading the same file again
      if(event.target) {
        event.target.value = '';
      }
  };

  const buttonStyle = "px-3 py-2 rounded-lg transition-all text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-opacity-50 border border-slate-700";
  const activeButtonStyle = `${buttonStyle} bg-violet-600 text-white border-transparent shadow-lg shadow-violet-500/20`;
  const inactiveButtonStyle = `${buttonStyle} bg-slate-800 text-slate-300 hover:bg-slate-700 hover:border-slate-600`;
  
  const getGenerationStatusText = () => {
      switch(generationStatus) {
          case 'generating_image': return 'Generando...';
          case 'analyzing_colors': return 'Procesando...';
          default: return 'Buscar Fondo';
      }
  }

  // Obtener los días actuales seleccionados
  const currentDays = dayBoxes.map(box => box.dayName);

  // Cambiar los días del flyer
  const handleDaysChange = (newDays: string[]) => {
    const newDayBoxes = newDays.map((dayName, index) => {
      // Intentar preservar los logos del día en la misma posición
      const existingBox = dayBoxes[index];
      return {
        id: `day-${dayName.toLowerCase().replace('é', 'e').replace('á', 'a')}`,
        dayName,
        logoIds: existingBox?.logoIds || [],
      };
    });
    onDayBoxesChange(newDayBoxes);
  };

  // Cambiar un día específico
  const handleSingleDayChange = (index: number, newDay: string) => {
    const newDays = [...currentDays];
    newDays[index] = newDay;
    handleDaysChange(newDays);
  };

  return (
    <aside className="w-full md:w-96 bg-[#111723] p-6 overflow-y-auto h-full flex flex-col justify-between shadow-lg border-l border-slate-800">
      <div>
        <h2 className="text-2xl font-bold mb-8 text-white tracking-wide font-display" style={{fontFamily: "'Unbounded', sans-serif"}}>Ajustes</h2>

        <SettingsSection title="Fondo">
          <div className="grid grid-cols-2 gap-3">
              <button onClick={onGenerateBackground} disabled={generationStatus !== 'idle'} className="w-full flex justify-center items-center gap-2 py-2.5 px-3 rounded-xl font-semibold bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors text-white shadow-lg shadow-violet-500/20 text-sm">
                  {generationStatus !== 'idle' && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                  {getGenerationStatusText()}
              </button>

              <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  accept="image/png, image/jpeg, image/webp"
                  disabled={generationStatus !== 'idle'}
              />
              <button onClick={() => fileInputRef.current?.click()} disabled={generationStatus !== 'idle'} className="w-full flex justify-center items-center gap-2 py-2.5 px-3 rounded-xl font-semibold bg-slate-800 border border-slate-700 hover:bg-slate-700 disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors text-slate-300 text-sm">
                  Subir Imagen
              </button>
          </div>
          
          {palettes.length > 1 && generationStatus === 'idle' && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold mb-2 text-slate-300">Paletas de Colores</h4>
              <div className="flex justify-between gap-2">
                {palettes.map((p, index) => (
                  <div
                    key={index}
                    onClick={() => onSelectPalette(index)}
                    className={`flex-1 p-1 rounded-lg cursor-pointer border-2 transition-all ${selectedPaletteIndex === index ? 'border-violet-400 scale-105 shadow-lg shadow-violet-500/20' : 'border-slate-700 hover:border-slate-500'}`}
                    title={`Seleccionar Paleta ${index + 1}`}
                  >
                    <div className="flex h-8 rounded-md overflow-hidden">
                      <div style={{ backgroundColor: p.primary }} className="w-1/2 h-full"></div>
                      <div style={{ backgroundColor: p.accent }} className="w-1/2 h-full"></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mt-4 space-y-4">
            <StyledRangeSlider label="Desenfoque" value={background.blur} min={0} max={10} step={0.1} onChange={(val) => onBackgroundChange({...background, blur: val})} />
            <StyledRangeSlider label="Oscurecer" value={background.brightness} min={0} max={100} onChange={(val) => onBackgroundChange({...background, brightness: val})} />
          </div>
        </SettingsSection>

        <SettingsSection title="Días del Flyer">
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              {DAY_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handleDaysChange(preset.days)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                    JSON.stringify(currentDays) === JSON.stringify(preset.days)
                      ? 'bg-violet-600 text-white border-transparent'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              {currentDays.map((day, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 w-12">Día {index + 1}:</span>
                  <select
                    value={day}
                    onChange={(e) => handleSingleDayChange(index, e.target.value)}
                    className="flex-1 bg-slate-800 p-2 rounded-lg border border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition"
                  >
                    {AVAILABLE_DAYS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </SettingsSection>

        <SettingsSection title="Eslogan">
          <input type="text" value={slogan.text} onChange={(e) => onSloganChange({...slogan, text: e.target.value})} className="w-full bg-slate-800 p-2.5 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500 transition"/>
          <div className="mt-4">
            <label className="block text-sm text-slate-300 mb-2">Tipografía</label>
            <select
              value={slogan.fontFamily}
              onChange={(e) => onSloganChange({ ...slogan, fontFamily: e.target.value })}
              className="w-full bg-slate-800 p-2.5 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500 transition"
            >
              {FONT_FAMILIES.map(font => <option key={font} value={font}>{font}</option>)}
            </select>
          </div>
          <div className="mt-4">
             <StyledRangeSlider label="Tamaño de Fuente" value={slogan.fontSize} min={16} max={96} onChange={(val) => onSloganChange({...slogan, fontSize: val})} />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4">
            {(Object.keys(SloganStyle) as Array<keyof typeof SloganStyle>).map(key => (
              <button key={key} onClick={() => onSloganChange({...slogan, style: SloganStyle[key]})} className={slogan.style === SloganStyle[key] ? activeButtonStyle : inactiveButtonStyle}>
                {SloganStyle[key]}
              </button>
            ))}
          </div>
        </SettingsSection>

        <SettingsSection title="Tamaño Global de Logos">
             <StyledRangeSlider label="Escala" value={logoScale} min={0.5} max={2.5} step={0.01} onChange={(val) => onLogoScaleChange(val)} />
        </SettingsSection>
      </div>
      
      <div className="flex flex-col gap-3 mt-6">
        <button onClick={onExport} className="w-full py-3 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:opacity-90 rounded-xl font-bold transition-opacity shadow-lg shadow-violet-500/20">Exportar como PNG</button>
        <button onClick={() => onExportProject && onExportProject()} className="w-full py-3 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold transition-opacity border border-slate-700 text-sm">Exportar proyecto (.json)</button>
      </div>
    </aside>
  );
};

export default SettingsPanel;