# flyersCreator

Pequeña aplicación React + Vite para crear y exportar flyers con logos y fondos generados por IA.

## Resumen

La app muestra un lienzo (flyer) con casillas por día donde puedes asignar logos. Incluye generación de fondos por IA y exportación a PNG. Se ha añadido lógica para exportar PNG sin esquinas redondeadas.

## Requisitos

- Node.js 18+ (o la versión que uses normalmente)
- npm o pnpm

## Variables de entorno

Crear un archivo `.env` o `.env.local` en la raíz del proyecto con las claves necesarias. Ejemplo mínimo (`.env`):

```
VITE_UNSPLASH_API_KEY=tu_clave_unsplash_aqui
VITE_GEMINI_API_KEY=tu_clave_gemini_aqui
```

- `VITE_UNSPLASH_API_KEY`: clave para usar la API de Unsplash (búsqueda de imágenes). Vite expone sólo variables que empiecen por `VITE_` al cliente.
- `VITE_GEMINI_API_KEY`: clave para el servicio de generación de paletas (Gemini). Ajusta según tu proveedor.

**Para Vercel/Netlify y otros proveedores serverless:**

Las llamadas a APIs externas (Unsplash, Gemini) se hacen desde endpoints serverless (`/api/unsplash`, `/api/genai`) para evitar problemas CORS y de exposición de claves. En el dashboard de tu proveedor, configura estas variables:

```
UNSPLASH_API_KEY=tu_clave_unsplash_aqui
GEMINI_API_KEY=tu_clave_gemini_aqui
```

(Sin el prefijo `VITE_` ya que son para el servidor, no el cliente)

> Nota: no subas tus archivos `.env` a repositorios públicos. Añadelos a `.gitignore` si procede.

## Instalación y ejecución (Windows / PowerShell)

Instalar dependencias:

```pwsh
pnpm install
# o
npm install
```

Ejecutar en modo desarrollo:

```pwsh
pnpm dev
# o
npm run dev
```

Construir para producción:

```pwsh
pnpm build
# o
npm run build
```

Previsualizar build:

```pwsh
pnpm preview
# o
npm run preview
```

## Exportar PNG sin esquinas redondeadas

La función de exportación ya está adaptada para quitar temporalmente el `border-radius` y `clip-path` del elemento del flyer antes de capturar la imagen, de modo que el PNG resultante no tenga esquinas redondeadas. Si necesitas ajustar este comportamiento (por ejemplo para controlar tiempo de repaint), edita `components/Editor.tsx` en la función `handleExport`.

## Ajustes de UI (rápido)

- Tamaño de fuente por defecto del slogan: `28` (estado inicial en `components/Editor.tsx`).
- Zoom de los iconos/logos por defecto: `1` (`logoScale` en `components/Editor.tsx`).
- Para cambiar el espaciado de los días o el layout de logos, edita `components/DayBox.tsx` y `components/FlyerCanvas.tsx`.

## Estructura relevante

- `components/Editor.tsx` — lógica principal, estado y exportación.
- `components/FlyerCanvas.tsx` — layout del lienzo (flyer).
- `components/DayBox.tsx` — cada casilla/día y cómo se muestran los logos.
- `.env` / `.env.local` — variables de entorno con prefijo `VITE_`.

## Problemas comunes

- Si no ves cambios en variables de entorno, reinicia el servidor Vite.
- Si TypeScript reclama tipos de Node (por ejemplo `process`), instala `@types/node` y añade `"types": ["node"]` en `tsconfig.json` si trabajas en código que accede a APIs de Node.

## Contribuir

Abre un issue o PR con cambios claros. Para cambios UI, crea primero una rama, aplica pruebas manuales y sube una PR.

---

Si quieres, puedo añadir secciones específicas (p. ej. screenshots, badges, o ejemplos de uso de la API de Unsplash) — dime qué prefieres incluir.
