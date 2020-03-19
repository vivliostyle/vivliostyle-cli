declare global {
  export interface Window {
    coreViewer: CoreViewer;
  }
}

export interface CoreViewer {
  readyState: string;
}
