export interface Logo {
  id: string;
  name: string;
  dataUrl: string;
}

export interface DayBoxData {
  id:string;
  dayName: string;
  logoIds: string[];
}

export interface Slogan {
    text: string;
    style: SloganStyle;
    fontSize: number;
    fontFamily: string;
}

export enum SloganStyle {
    Default = 'Default',
    Neon = 'Neon',
    Outline = 'Outline',
    ThreeD = '3D',
    Glitch = 'Glitch',
    Gradient = 'Gradient',
}

export interface Palette {
    primary: string;
    accent: string;
}

export type GenerationStatus = 'idle' | 'generating_image' | 'analyzing_colors';
