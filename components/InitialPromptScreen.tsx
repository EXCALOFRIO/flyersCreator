
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { PaperclipIcon } from './icons/PaperclipIcon';
import type { DayBoxData } from '../types';

interface InitialPromptScreenProps {
    allLogoNames: string[];
    onSuccess: (dayBoxes: DayBoxData[]) => void;
    onImportProject?: (project: any) => void;
}

// Presets de días
const DAY_PRESETS = [
  { label: 'Jue-Sáb', days: ['JUEVES', 'VIERNES', 'SÁBADO'] },
  { label: 'Mié-Vie', days: ['MIÉRCOLES', 'JUEVES', 'VIERNES'] },
  { label: 'Vie-Dom', days: ['VIERNES', 'SÁBADO', 'DOMINGO'] },
];

// Compress and downscale an image to stay well below Vercel's 4-5MB body limit.
// Returns a JPEG data URL (quality ~0.75) with max dimension capped.
const compressImageFile = (
    file: File,
    { maxDimension = 1280, quality = 0.75 }: { maxDimension?: number; quality?: number } = {}
): Promise<{ dataUrl: string; mimeType: string; name: string; approxBytes: number }> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;
                // Scale preserving aspect ratio
                if (width > height && width > maxDimension) {
                    height = Math.round((height * maxDimension) / width);
                    width = maxDimension;
                } else if (height >= width && height > maxDimension) {
                    width = Math.round((width * maxDimension) / height);
                    height = maxDimension;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('No 2D context'));
                    return;
                }
                ctx.drawImage(img, 0, 0, width, height);
                // Force JPEG to significantly reduce size; transparency will be flattened
                const mimeType = 'image/jpeg';
                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            reject(new Error('Failed to create blob'));
                            return;
                        }
                        const r2 = new FileReader();
                        r2.onerror = reject;
                        r2.onloadend = () => {
                            const dataUrl = r2.result as string;
                            resolve({ dataUrl, mimeType, name: file.name, approxBytes: blob.size });
                        };
                        r2.readAsDataURL(blob);
                    },
                    mimeType,
                    quality
                );
            };
            img.onerror = reject;
            img.src = reader.result as string;
        };
        reader.readAsDataURL(file);
    });

const InitialPromptScreen: React.FC<InitialPromptScreenProps> = ({ allLogoNames, onSuccess, onImportProject }) => {
  const [textValue, setTextValue] = useState('');
  const [files, setFiles] = useState<{ dataUrl: string, mimeType: string, name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState<string[]>(['JUEVES', 'VIERNES', 'SÁBADO']);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
    const projectInputRef = useRef<HTMLInputElement | null>(null);
  
    const enqueueFiles = useCallback(async (fileList: FileList | File[]) => {
    const imageFiles = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    if (!imageFiles.length) return;
    
    // For simplicity, we'll just handle one image for the prompt.
    const fileToProcess = imageFiles[0];
        try {
            const compressed = await compressImageFile(fileToProcess, { maxDimension: 1280, quality: 0.75 });
            // If still too big (>3.5MB), try a second pass lighter
            if (compressed.approxBytes > 3.5 * 1024 * 1024) {
                const lighter = await compressImageFile(fileToProcess, { maxDimension: 1024, quality: 0.65 });
                setFiles([{ dataUrl: lighter.dataUrl, mimeType: lighter.mimeType, name: fileToProcess.name }]);
            } else {
                setFiles([{ dataUrl: compressed.dataUrl, mimeType: compressed.mimeType, name: fileToProcess.name }]);
            }
        } catch (e) {
            console.error('Error compressing image:', e);
            // Fallback: store original as data URL (may hit server limit)
            const fallback = await new Promise<{ dataUrl: string; mimeType: string; name: string }>((resolve, reject) => {
                const r = new FileReader();
                r.onloadend = () => resolve({ dataUrl: r.result as string, mimeType: fileToProcess.type || 'image/png', name: fileToProcess.name });
                r.onerror = reject;
                r.readAsDataURL(fileToProcess);
            });
            setFiles([fallback]);
        }
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    enqueueFiles(e.target.files);
  }, [enqueueFiles]);

  const onPaste = useCallback(async (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const items = Array.from(e.clipboardData.items || []).filter(it => it.type.startsWith('image/'));
      if (items.length > 0) {
        e.preventDefault();
        const file = items[0].getAsFile();
        if(file) enqueueFiles([file]);
      }
    }, [enqueueFiles]);

  useEffect(() => {
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [onPaste]);

  const handleSend = async () => {
    if (isLoading || (!textValue.trim() && files.length === 0)) return;

    setIsLoading(true);
    setError(null);

    // Crear schema dinámico basado en los días seleccionados
    const dayKeys = selectedDays.map(d => d.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    const schemaProperties: Record<string, any> = {};
    const requiredKeys: string[] = [];
    
    selectedDays.forEach((day, index) => {
      const key = dayKeys[index];
      schemaProperties[key] = { 
        type: 'array', 
        description: `Logos para el ${day}.`, 
        items: { type: 'string' }
      };
      requiredKeys.push(key);
    });

    const daysListText = selectedDays.join(', ');

    try {
        const promptParts: any[] = [
            { text: `Petición del usuario: "${textValue}"` },
            { text: `Nombres de archivo de los logos disponibles: ${JSON.stringify(allLogoNames)}` },
        ];

        if (files.length > 0) {
            const file = files[0];
            promptParts.unshift({
                inlineData: {
                    mimeType: file.mimeType,
                    data: file.dataUrl.split(',')[1],
                },
            });
        }

        const payload = {
            model: "gemini-2.5-flash",
            contents: { parts: promptParts },
            config: {
                systemInstruction: `Eres un asistente experto en diseño de flyers para discotecas. Tu tarea es analizar la petición del usuario (que puede incluir texto y una imagen de referencia) y determinar qué logos de discotecas deben aparecer para los días ${daysListText}. Debes usar ÚNICAMENTE los nombres de archivo de la lista proporcionada. Tu respuesta DEBE ser un objeto JSON con las claves: ${dayKeys.map(k => `'${k}'`).join(', ')}. El valor de cada clave debe ser un array de strings, donde cada string es un nombre de archivo de logo exacto de la lista de logos disponibles.`,
                responseMimeType: "application/json",
                responseSchema: {
                    type: 'object',
                    properties: schemaProperties,
                    required: requiredKeys
                },
            },
        };

        const serverResp = await fetch('/api/genai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!serverResp.ok) {
            // Try to read JSON or text body to show useful error locally
            let bodyText = '';
            try {
                const j = await serverResp.json();
                bodyText = JSON.stringify(j);
            } catch (e) {
                try { bodyText = await serverResp.text(); } catch { bodyText = '<no body>'; }
            }
            throw new Error(`Error en el servidor al generar la respuesta AI: ${bodyText}`);
        }

        const serverJson = await serverResp.json();
        const responseText = serverJson.text;
        const parsedResponse = JSON.parse(responseText);

        const dayBoxes: DayBoxData[] = selectedDays.map((day, index) => {
            const key = dayKeys[index];
            return {
                id: `day-${key}`,
                dayName: day,
                logoIds: parsedResponse[key] || []
            };
        });
        
        onSuccess(dayBoxes);

    } catch (err) {
        console.error("Error al generar la configuración del flyer:", err);
        setError("No se pudo procesar la petición. Asegúrate de que tu petición es clara y que los logos mencionados existen. Por favor, inténtalo de nuevo.");
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="text-center mb-8 max-w-2xl">
            <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-3 font-display" style={{fontFamily: "'Unbounded', sans-serif"}}>Flyer Night Pro</h1>
            <p className="text-slate-400 text-lg">Describe tu flyer o sube una imagen de referencia. La IA lo configurará por ti.</p>
        </div>

        {/* Selector de días */}
        <div className="w-full max-w-2xl mx-auto mb-4">
            <div className="flex items-center justify-center gap-2 flex-wrap">
                <span className="text-slate-400 text-sm mr-2">Días:</span>
                {DAY_PRESETS.map((preset) => (
                    <button
                        key={preset.label}
                        onClick={() => setSelectedDays(preset.days)}
                        disabled={isLoading}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
                            JSON.stringify(selectedDays) === JSON.stringify(preset.days)
                                ? 'bg-violet-600 text-white border-violet-500 shadow-lg shadow-violet-500/20'
                                : 'bg-slate-800/50 text-slate-300 border-slate-700 hover:bg-slate-700 hover:border-slate-600'
                        } disabled:opacity-50`}
                    >
                        {preset.label}
                    </button>
                ))}
            </div>
        </div>

        <div className="w-full max-w-2xl mx-auto rounded-2xl border border-slate-700/40 shadow-xl bg-slate-900/30 backdrop-blur-xl p-4 space-y-3">
            {files.length > 0 && (
                <div className="p-3 bg-slate-800/30 rounded-xl border border-slate-700/40 w-full">
                    {files.map((file, idx) => (
                        <div key={idx} className="relative group inline-block">
                            <img src={file.dataUrl} alt={file.name} className="w-20 h-20 object-cover rounded-lg border-2 border-slate-600/40" />
                            <button
                                onClick={() => setFiles([])}
                                className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-400 text-white w-7 h-7 rounded-full flex items-center justify-center shadow-lg"
                                aria-label="Eliminar imagen"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className="relative flex items-center w-full">
                <textarea
                    value={textValue}
                    onChange={(e) => setTextValue(e.target.value)}
                    placeholder="Ej: Usa el flyer de referencia pero quita el logo de Chaman..."
                    className="w-full h-28 resize-none bg-slate-800/40 rounded-xl border border-slate-600/40 p-4 pr-28 text-slate-100 placeholder-slate-400/60 focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/50 outline-none transition-all"
                    disabled={isLoading}
                />
                <div className="absolute right-3 flex flex-col gap-2">
                     <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isLoading}
                        className="w-10 h-10 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-violet-200 hover:text-white border border-slate-600/50 hover:border-violet-400/60 shadow-md flex items-center justify-center transition-all duration-200"
                        title="Adjuntar imagen"
                    >
                        <PaperclipIcon className="w-5 h-5" />
                    </button>
                    <button
                        onClick={handleSend}
                        disabled={isLoading || (!textValue.trim() && files.length === 0)}
                        className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white flex items-center justify-center shadow-lg transition-all duration-200 border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
                        title="Generar Flyer"
                    >
                        {isLoading ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" /></svg>
                        )}
                    </button>
                </div>
            </div>
            <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handleFileChange}
            />
        </div>
        {error && <p className="mt-4 text-red-400 text-center max-w-xl">{error}</p>}
        <div className="text-center mt-4 text-xs text-slate-500">
            <p>Puedes pegar una imagen desde tu portapapeles (Ctrl+V).</p>
        </div>
            <div className="text-center mt-4">
                                    <input
                                        ref={projectInputRef}
                                        type="file"
                                        accept="application/json"
                                        className="hidden"
                                        onChange={async (e) => {
                                            const inputEl = e.currentTarget as HTMLInputElement;
                                            const file = inputEl.files?.[0];
                                            if (!file) {
                                                // clear value synchronously and bail out
                                                try { inputEl.value = ''; } catch {}
                                                return;
                                            }
                                            try {
                                                const text = await file.text();
                                                const json = JSON.parse(text);
                                                if (typeof onImportProject === 'function') onImportProject(json);
                                            } catch (err) {
                                                console.error('Invalid project file', err);
                                                alert('Archivo de proyecto inválido');
                                            } finally {
                                                try { inputEl.value = ''; } catch {}
                                            }
                                        }}
                                    />
                <button onClick={() => projectInputRef.current?.click()} className="mt-2 text-sm text-slate-400 underline">Importar proyecto (.json)</button>
            </div>
    </div>
  );
};

export default InitialPromptScreen;
