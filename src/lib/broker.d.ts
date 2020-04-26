declare global {
  export interface Window {
    coreViewer: CoreViewer;
  }
}

export interface CoreViewer {
  readyState: string;
  addListener(type: string, listener: (payload: Payload) => void): void;
  removeListener(type: string, listener: (payload: Payload) => void): void;
  getMetadata(): Meta;
  showTOC(show: boolean): void;
  getTOC(): TOCItem[];
  getCover(): CoverItem | null;
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

export interface CoverItem {
  src: string;
  mediaType: string | null;
}
