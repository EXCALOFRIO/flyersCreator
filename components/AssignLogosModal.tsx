import React, { useState, useEffect } from 'react';
import type { Logo } from '../types';

interface AssignLogosModalProps {
  allLogos: Logo[];
  assignedLogoIds: string[];
  onClose: () => void;
  onAssign: (logoIds: string[]) => void;
}

const AssignLogosModal: React.FC<AssignLogosModalProps> = ({ allLogos, assignedLogoIds, onClose, onAssign }) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(assignedLogoIds));

  const handleToggleLogo = (logoId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(logoId)) {
        newSet.delete(logoId);
      } else {
        newSet.add(logoId);
      }
      return newSet;
    });
  };
  
  const handleSave = () => {
    onAssign(Array.from(selectedIds));
  };
  
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
       if (event.key === 'Escape') {
         onClose();
       }
    };
    window.addEventListener('keydown', handleEsc);

    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-lg flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-slate-900/70 rounded-2xl shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col border border-slate-800"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-800">
            <h2 className="text-2xl font-bold text-violet-300 font-display">Asignar Logos</h2>
            <p className="text-slate-400 mt-1">Selecciona los logos para este día.</p>
        </div>
        
        <div className="p-6 overflow-y-auto">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {allLogos.map(logo => (
                    <div 
                        key={logo.id} 
                        className={`p-3 rounded-lg cursor-pointer transition-all duration-200 aspect-square flex flex-col justify-center items-center relative overflow-hidden ${selectedIds.has(logo.id) ? 'bg-slate-700' : 'bg-slate-800 hover:bg-slate-700/50'}`}
                        onClick={() => handleToggleLogo(logo.id)}
                    >
                        <div className={`absolute inset-0 bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-opacity duration-300 ${selectedIds.has(logo.id) ? 'opacity-20' : 'opacity-0'}`}></div>
                        <div className={`absolute inset-0 ring-2 ring-inset ring-violet-400 rounded-lg transition-opacity duration-300 ${selectedIds.has(logo.id) ? 'opacity-100' : 'opacity-0'}`}></div>

                        <img src={logo.dataUrl} alt={logo.name} className="h-16 w-full object-contain relative z-10" />
                        <p className="text-xs text-center mt-2 truncate text-slate-300 relative z-10">{logo.name.split('/').pop()?.replace('.png','')}</p>
                    </div>
                ))}
            </div>
        </div>
        
        <div className="p-6 border-t border-slate-800 flex justify-end gap-4 bg-slate-900/50 rounded-b-2xl">
            <button onClick={onClose} className="px-6 py-2.5 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors font-semibold">Cancelar</button>
            <button onClick={handleSave} className="px-6 py-2.5 bg-violet-600 rounded-lg hover:bg-violet-500 transition-colors font-semibold">Guardar Cambios</button>
        </div>
      </div>
    </div>
  );
};

export default AssignLogosModal;