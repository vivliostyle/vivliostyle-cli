declare global {
  export interface Window {
    coreViewer: CoreViewer;
  }
}

export const SRGB_MAX = 10000;
export const CMYK_MAX = 10000;

export interface CMYKValue {
  c: number;
  m: number;
  y: number;
  k: number;
}

export type CmykMap = Record<string, CMYKValue>;

export interface CoreViewer {
  readyState: string;
  addListener(type: string, listener: (payload: Payload) => void): void;
  removeListener(type: string, listener: (payload: Payload) => void): void;
  getMetadata(): Meta;
  showTOC(show: boolean): void;
  getTOC(): TOCItem[];
  getCmykMap(): CmykMap;
}

export interface Payload {
  t: string;
  a?: string;
}

export interface Meta {
  [key: string]: MetaItem[];
}

export interface MetaItem {
  v: string;
  o: number;
  s?: string;
  r?: Meta;
}

export interface TOCItem {
  id: string;
  title: string;
  children: TOCItem[];
}
