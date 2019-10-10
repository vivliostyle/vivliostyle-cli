// https://github.com/cyrus-and/chrome-remote-interface/blob/master/lib/protocol.json

declare module 'chrome-remote-interface' {
  export = chrome;
}

declare function chrome(fn: (args: Protocol) => void): Event;

interface Protocol {
  Page: Page;
  Runtime: Runtime;
  Emulation: Emulation;
  close: () => Promise<void>;
}

interface Event {
  on: (eventType: string, cb: (args?: any) => unknown) => void;
}

type TransitionType =
  | 'link'
  | 'typed'
  | 'address_bar'
  | 'auto_bookmark'
  | 'auto_subframe'
  | 'manual_subframe'
  | 'generated'
  | 'auto_toplevel'
  | 'form_submit'
  | 'reload'
  | 'keyword'
  | 'keyword_generated'
  | 'other';

interface Page {
  enable: () => Promise<void>;
  loadEventFired: (fn: () => Promise<void>) => Promise<void>;
  printToPDF: (args: {
    landscape?: boolean;
    displayHeaderFooter?: boolean;
    printBackground?: boolean;
    scale?: number;
    paperWidth?: number;
    paperHeight?: number;
    marginTop?: number;
    marginBottom?: number;
    marginLeft?: number;
    marginRight?: number;
    pageRanges?: string;
    ignoreInvalidPageRanges?: boolean;
    headerTemplate?: string;
    footerTemplate?: string;
    preferCSSPageSize?: boolean;
    transferMode?: 'ReturnAsBase64' | 'ReturnAsStream';
  }) => Promise<{data: string; stream: any}>;
  navigate: (args: {
    url: string;
    referrer?: string;
    transitionType?: TransitionType;
    frameId?: number;
  }) => Promise<void>;
}

interface Runtime {
  enable: () => Promise<void>;
}

interface Emulation {}
