import React from 'react';

type Theme = 'urban' | 'nature' | 'cosmic' | 'abstract' | 'vintage' | 'surprise';

interface ThemeSelectorModalProps {
  onClose: () => void;
  onSelectTheme: (theme: Theme) => void;
}

const THEMES = [
    { id: 'urban', name: 'Urbano', icon: '🏙️' },
    { id: 'nature', name: 'Naturaleza', icon: '🌲' },
    { id: 'cosmic', name: 'Cósmico', icon: '🪐' },
    { id: 'abstract', name: 'Abstracto', icon: '🎨' },
    { id: 'vintage', name: 'Vintage', icon: '📷' },
    { id: 'surprise', name: 'Random', icon: '✨' },
] as const;


const ThemeSelectorModal: React.FC<ThemeSelectorModalProps> = ({ onClose, onSelectTheme }) => {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-lg flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-slate-900/70 rounded-2xl shadow-xl w-full max-w-2xl flex flex-col border border-slate-800"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-800 text-center">
            <h2 className="text-2xl font-bold text-violet-300 font-display">Elige un Estilo</h2>
            <p className="text-slate-400 mt-1">Selecciona un tema para tu fondo generado por IA.</p>
        </div>
        
        <div className="p-6 grid grid-cols-2 md:grid-cols-3 gap-4">
            {THEMES.map(theme => (
                <button
                    key={theme.id}
                    onClick={() => onSelectTheme(theme.id)}
                    className="p-6 bg-slate-800 rounded-xl border border-slate-700 hover:bg-violet-600/20 hover:border-violet-500 hover:text-white transition-all transform hover:-translate-y-1 group"
                >
                    <div className="text-4xl mb-3">{theme.icon}</div>
                    <h3 className="text-lg font-bold group-hover:text-violet-300 transition-colors">{theme.name}</h3>
                </button>
            ))}
        </div>
      </div>
    </div>
  );
};

export default ThemeSelectorModal;