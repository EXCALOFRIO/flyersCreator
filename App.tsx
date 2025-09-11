
import React, { useState, useEffect } from 'react';
import type { Logo, DayBoxData } from './types';
import Editor from './components/Editor';
import InitialPromptScreen from './components/InitialPromptScreen';

const App: React.FC = () => {
  const [logos, setLogos] = useState<Logo[]>([]);
  const [isLoadingLogos, setIsLoadingLogos] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [configuredDayBoxes, setConfiguredDayBoxes] = useState<DayBoxData[] | null>(null);

  useEffect(() => {
    const loadLogos = async () => {
      setIsLoadingLogos(true);
      setError(null);
      try {
        // Cargar desde public/ usando fetch - funciona perfectamente en Vercel serverless
        const manifestResponse = await fetch('/logos.json');
        if (!manifestResponse.ok) {
          throw new Error('No se pudo encontrar el archivo `logos.json`. Este archivo es necesario para saber qué logos cargar.');
        }
        const logoFilenames: string[] = await manifestResponse.json();

        if (!Array.isArray(logoFilenames) || logoFilenames.length === 0) {
          throw new Error('El archivo `logos.json` está vacío o no tiene el formato correcto.');
        }

        const loadedLogos = await Promise.all(
          logoFilenames.map(async (filename) => {
            try {
                const logoResponse = await fetch(`/logos_discotecas/${filename}`);
                if (!logoResponse.ok) {
                    console.warn(`Logo listado en logos.json no encontrado, se omitirá: ${filename}`);
                    return null;
                }
                const blob = await logoResponse.blob();
                return new Promise<Logo>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        resolve({
                            id: filename,
                            name: filename,
                            dataUrl: reader.result as string,
                        });
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
            } catch (e) {
                console.warn(`Error procesando el logo ${filename}, se omitirá:`, e);
                return null;
            }
          })
        );
        
        const validLogos = loadedLogos.filter((l): l is Logo => l !== null);

        if (validLogos.length === 0) {
            throw new Error('No se pudo cargar ningún logo de los listados en `logos.json`.');
        }

        setLogos(validLogos);
      } catch (err: any) {
        setError(err.message || 'Ocurrió un error inesperado al cargar los logos.');
      } finally {
        setIsLoadingLogos(false);
      }
    };

    loadLogos();
  }, []);

  const [importedEditorState, setImportedEditorState] = useState<any | null>(null);

  const handleFlyerConfigured = (dayBoxes: DayBoxData[]) => {
    setConfiguredDayBoxes(dayBoxes);
  };

  const handleImportProject = (project: any) => {
    if (project && project.editorState) {
      setImportedEditorState(project.editorState);
      setConfiguredDayBoxes(project.editorState.dayBoxes || null);
    }
  };

  if (isLoadingLogos) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-400 mb-4"></div>
        <p className="text-slate-400 text-lg">Cargando recursos de la aplicación...</p>
      </div>
    );
  }

  if (error) {
     return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
            <h1 className="text-2xl font-bold text-red-400 mb-4">Error de Configuración</h1>
            <p className="text-slate-400 max-w-md">{error}</p>
            <p className="text-slate-500 mt-4 text-sm">Por favor, revisa las instrucciones en la consola del navegador para más detalles.</p>
        </div>
     );
  }

  return (
    <div className="min-h-screen h-screen text-white font-sans bg-[#0D1117]">
      {!configuredDayBoxes ? (
        <InitialPromptScreen 
          allLogoNames={logos.map(l => l.name)}
          onSuccess={handleFlyerConfigured}
          onImportProject={handleImportProject}
        />
      ) : (
        <Editor logos={logos} initialDayBoxes={configuredDayBoxes} initialState={importedEditorState} />
      )}
    </div>
  );
};

export default App;
