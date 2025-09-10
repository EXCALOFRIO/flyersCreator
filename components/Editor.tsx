
import React, { useState, useRef, useCallback, useEffect } from 'react';
// No importar SDK en cliente: usar schema JSON directamente
import type { Logo, DayBoxData, Palette, Slogan, GenerationStatus } from '../types';
import { SloganStyle } from '../types';
import FlyerCanvas from './FlyerCanvas';
import SettingsPanel from './SettingsPanel';
import AssignLogosModal from './AssignLogosModal';
import ThemeSelectorModal from './ThemeSelectorModal';

declare const htmlToImage: any;

const THEME_QUERIES = {
  urban: 'city night life, neon signs, urban street',
  nature: 'serene landscape, forest, mountains, waterfall',
  cosmic: 'galaxy, nebula, stars, space',
  abstract: 'abstract shapes, colorful liquid, light trails',
  vintage: 'retro, 1980s, vintage car, film grain',
};

// Función para comprimir imagen antes de enviarla al servidor
const compressImage = (canvas: HTMLCanvasElement, quality: number = 0.7): string => {
  return canvas.toDataURL('image/jpeg', quality);
};

const resizeImage = (img: HTMLImageElement, maxWidth: number = 800, maxHeight: number = 600): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  
  // Calcular nuevas dimensiones manteniendo aspecto
  let { width, height } = img;
  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width *= ratio;
    height *= ratio;
  }
  
  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
};

const imageUrlToBase64 = async (url: string): Promise<{ base64: string, mimeType: string }> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const canvas = resizeImage(img, 800, 600);
                const compressedBase64 = compressImage(canvas, 0.6);
                resolve({ base64: compressedBase64, mimeType: 'image/jpeg' });
            } catch (error) {
                reject(error);
            }
        };
        img.onerror = reject;
        img.src = url;
    });
};


const Editor: React.FC<{ logos: Logo[]; initialDayBoxes: DayBoxData[] }> = ({ logos, initialDayBoxes }) => {
  const [dayBoxes, setDayBoxes] = useState<DayBoxData[]>(initialDayBoxes);
  const [background, setBackground] = useState({ image: '', blur: 2, brightness: 50 });
  const [slogan, setSlogan] = useState<Slogan>({ text: '¡ESTO Y MUCHO MÁS!', style: SloganStyle.Default, fontSize: 28, fontFamily: 'Unbounded' });
  const [palettes, setPalettes] = useState<Palette[]>([{ primary: '#FBBF24', accent: '#EC4899' }]);
  const [selectedPaletteIndex, setSelectedPaletteIndex] = useState(0);
  const [logoScale, setLogoScale] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isThemeSelectorOpen, setIsThemeSelectorOpen] = useState(false);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>('idle');
  const [showSettings, setShowSettings] = useState(false);


  const flyerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      // If we are loaded with pre-configured boxes but no background, start the theme selection.
      if (dayBoxes.length > 0 && !background.image) {
          setIsThemeSelectorOpen(true);
      }
  }, []); // Run only once on mount

  const generatePalette = async (imageUrl: string, mimeType: string): Promise<Palette[]> => {
    try {
      // Extraer base64 limpio
      const rawBase64 = imageUrl && imageUrl.includes(',') ? imageUrl.split(',')[1] : imageUrl;

      const promptText = `Analiza esta imagen y sugiere 3 paletas de colores distintas y visualmente armoniosas. Cada paleta es para elementos de UI sobre la imagen. Para cada paleta, proporciona un color 'primary' y un color 'accent' vibrante. Crucialmente, el color 'primary' DEBE ser un color claro, tipo pastel (por ejemplo, amarillo claro, cian pálido o un lavanda suave), pero por favor evita usar blanco puro (#FFFFFF) para las tres paletas para asegurar variedad. Debe tener un ratio de contraste muy alto contra la imagen general para asegurar que los elementos de texto como los nombres de los días sean fácilmente legibles y accesibles. El color 'accent' debe ser vibrante y complementario para efectos especiales. Devuelve un único objeto JSON con una clave 'palettes' que es un array de estos 3 objetos de paleta. Cada objeto debe tener las claves: 'primary' y 'accent', con valores de código de color hexadecimal en formato string.`;

      // Usar formato de proxy como en TestResolver
      const payload = {
        model: 'gemini-2.5-flash',
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: mimeType || 'image/jpeg',
                  data: rawBase64
                }
              },
              { text: promptText }
            ]
          }
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              palettes: {
                type: 'array',
                description: 'An array of 3 color palettes.',
                items: {
                  type: 'object',
                  properties: {
                    primary: { type: 'string', description: 'High-contrast primary color for text.' },
                    accent: { type: 'string', description: 'Vibrant accent color for effects.' },
                  },
                  required: ['primary', 'accent'],
                }
              }
            },
            required: ['palettes'],
          }
        }
      };

      const serverResp = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!serverResp.ok) {
        const errorData = await serverResp.json().catch(() => ({}));
        throw new Error(errorData.error || 'Error en el servidor al generar paletas');
      }
      
      const serverJson = await serverResp.json();
      const responseText = serverJson.text;
      const { palettes: newPalettes } = JSON.parse(responseText);
      return newPalettes;

    } catch (error) {
      console.error('Error generating palette with Gemini:', error);
      alert('No se pudieron generar las paletas de colores. Por favor, revisa la imagen o inténtalo de nuevo.');
      return [];
    }
  };

  const handleGenerateBackground = useCallback(async (theme: 'urban' | 'nature' | 'cosmic' | 'abstract' | 'vintage' | 'surprise') => {
    if (generationStatus !== 'idle') return;

    setIsThemeSelectorOpen(false);
    setGenerationStatus('generating_image');
    let newImageGenerated = false;

    try {
        let query = THEME_QUERIES.urban; // Fallback
        if (theme === 'surprise') {
            const allThemes = Object.keys(THEME_QUERIES) as Array<keyof typeof THEME_QUERIES>;
            const randomThemeKey = allThemes[Math.floor(Math.random() * allThemes.length)];
            query = THEME_QUERIES[randomThemeKey];
        } else {
            query = THEME_QUERIES[theme as keyof typeof THEME_QUERIES];
        }

        const unsplashResponse = await fetch('/api/unsplash', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, orientation: 'portrait' }),
        });

        if (!unsplashResponse.ok) {
            const errorData = await unsplashResponse.json();
            throw new Error(`Error fetching from Unsplash: ${unsplashResponse.statusText} - ${errorData.error || 'Unknown error'}`);
        }

        const unsplashData = await unsplashResponse.json();
        const imageUrl = unsplashData.imageUrl;
        
        const { base64: base64Image, mimeType } = await imageUrlToBase64(imageUrl);
        newImageGenerated = true;

        setGenerationStatus('analyzing_colors');
        const newPalettes = await generatePalette(base64Image, mimeType);

        if (newPalettes.length > 0) {
            setBackground({ ...background, image: base64Image });
            setPalettes(newPalettes);
            setSelectedPaletteIndex(0);
        } else {
            throw new Error("Palette generation returned no palettes.");
        }

    } catch (error) {
        console.error("Error during generation process:", error);
        if (newImageGenerated) {
            alert("Se generó una imagen, pero no se pudieron crear las paletas de colores. Por favor, inténtalo de nuevo.");
        } else {
            alert(`No se pudo generar la imagen de fondo. Por favor, revisa tu conexión o inténtalo de nuevo. Detalle: ${error}`);
        }
    } finally {
        setGenerationStatus('idle');
    }
  }, [background, generationStatus]);

  const handleCustomBackgroundUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
        alert('Por favor, sube un archivo de imagen válido (jpeg, png, etc).');
        return;
    }
    if (generationStatus !== 'idle') return;

    setGenerationStatus('analyzing_colors');
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        const imageUrl = e.target?.result as string;
        if (!imageUrl) {
            alert('No se pudo leer el archivo de imagen.');
            setGenerationStatus('idle');
            return;
        }

        try {
            const newPalettes = await generatePalette(imageUrl, file.type);

            if (newPalettes.length > 0) {
                setBackground({ ...background, image: imageUrl });
                setPalettes(newPalettes);
                setSelectedPaletteIndex(0);
            } else {
                setBackground({ ...background, image: imageUrl });
                setPalettes([{ primary: '#FFFFFF', accent: '#EC4899' }]);
                setSelectedPaletteIndex(0);
                throw new Error("Palette generation returned no palettes, but background was set with default colors.");
            }
        } catch (error) {
            console.error("Error during custom background processing:", error);
            alert("Se estableció el fondo, pero no se pudieron crear paletas de colores a juego. Usando colores por defecto.");
        } finally {
            setGenerationStatus('idle');
        }
    };
    reader.onerror = () => {
        alert('Error al leer el archivo.');
        setGenerationStatus('idle');
    };
    reader.readAsDataURL(file);
  };

  const openAssignModal = (dayId: string) => {
    setSelectedDayId(dayId);
    setIsModalOpen(true);
  };

  const handleAssignLogos = (dayId: string, assignedLogoIds: string[]) => {
    setDayBoxes(prev => prev.map(box => box.id === dayId ? { ...box, logoIds: assignedLogoIds } : box));
    setIsModalOpen(false);
    setSelectedDayId(null);
  };
  
  const handleExport = useCallback(async () => {
    if (!flyerRef.current) return;
    const el = flyerRef.current as HTMLElement;

    // Guardar estilos inline previos para restaurarlos después
    const prevBorderRadius = el.style.borderRadius;
    const prevClipPath = el.style.clipPath;
    const prevOverflow = el.style.overflow;

    try {
      // Quitar esquinas redondeadas y cualquier recorte antes de exportar
      el.style.borderRadius = '0';
      el.style.clipPath = 'none';
      el.style.overflow = 'visible';

      // Pequeña espera para asegurar repaint antes de capturar
      await new Promise((res) => setTimeout(res, 50));

      const dataUrl: string = await htmlToImage.toPng(el, { quality: 1, pixelRatio: 4 });
      const link = document.createElement('a');
      link.download = 'flyer-night-pro.png';
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('oops, something went wrong!', err);
    } finally {
      // Restaurar estilos inline anteriores
      el.style.borderRadius = prevBorderRadius;
      el.style.clipPath = prevClipPath;
      el.style.overflow = prevOverflow;
    }
  }, [flyerRef]);

  const selectedDayLogos = dayBoxes.find(d => d.id === selectedDayId)?.logoIds || [];
  const activePalette = palettes[selectedPaletteIndex] || palettes[0];

  return (
    <div className="relative md:flex md:flex-row h-screen overflow-hidden font-sans">
      
      <main className={`flex-1 flex flex-col items-center justify-center p-4 overflow-auto ${showSettings ? 'hidden' : 'flex'} md:flex`}>
        <FlyerCanvas
          ref={flyerRef}
          background={background}
          dayBoxes={dayBoxes}
          allLogos={logos}
          slogan={slogan}
          logoScale={logoScale}
          onDayBoxClick={openAssignModal}
          palette={activePalette}
          generationStatus={generationStatus}
        />
      </main>

      <div className={`w-full h-full md:w-96 md:h-screen ${showSettings ? 'block' : 'hidden'} md:block`}>
        <SettingsPanel
          background={background}
          onBackgroundChange={setBackground}
          slogan={slogan}
          onSloganChange={setSlogan}
          logoScale={logoScale}
          onLogoScaleChange={setLogoScale}
          onExport={handleExport}
          palettes={palettes}
          selectedPaletteIndex={selectedPaletteIndex}
          onSelectPalette={setSelectedPaletteIndex}
          generationStatus={generationStatus}
          onGenerateBackground={() => setIsThemeSelectorOpen(true)}
          onCustomBackgroundUpload={handleCustomBackgroundUpload}
        />
      </div>

       {/* Mobile Toggle Button */}
      <div className="md:hidden fixed bottom-6 right-6 z-50">
        <button
          onClick={() => setShowSettings(!showSettings)}
          aria-label={showSettings ? "Mostrar previsualización" : "Mostrar ajustes"}
          className="w-16 h-16 bg-gradient-to-r from-violet-600 to-fuchsia-500 rounded-full text-white shadow-lg flex items-center justify-center transform transition-transform hover:scale-110 active:scale-95"
        >
          {showSettings ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path><circle cx="12" cy="12" r="3"></circle></svg>
          )}
        </button>
      </div>
      
      {isModalOpen && selectedDayId && (
        <AssignLogosModal
          allLogos={logos}
          assignedLogoIds={selectedDayLogos}
          onClose={() => setIsModalOpen(false)}
          onAssign={(logoIds) => handleAssignLogos(selectedDayId, logoIds)}
        />
      )}

      {isThemeSelectorOpen && (
        <ThemeSelectorModal
            onClose={() => setIsThemeSelectorOpen(false)}
            onSelectTheme={handleGenerateBackground}
        />
      )}
    </div>
  );
};

export default Editor;
