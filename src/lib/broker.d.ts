declare global {
  export interface Window {
    coreViewer: CoreViewer;
  }
}

export interface CoreViewer {
  readyState: string;
  getMetadata(): Meta;
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
