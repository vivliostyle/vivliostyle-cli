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
  evaluate: (args: {
    expression: string;
    objectGroup?: string;
    includeCommandLineAPI?: boolean;
    silent?: boolean;
    contextId?: number;
    returnByValue?: boolean;
    generatePreview?: boolean;
    userGesture?: boolean;
    awaitPromise?: boolean;
    throwOnSideEffect?: boolean;
    timeout?: number;
  }) => Promise<{result: RemoteObject; exceptionDetails?: ExceptionDetails}>;
}

interface Emulation {
  setEmulatedMedia: (args: {media: string}) => Promise<void>;
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

interface RemoteObject {
  type:
    | 'object'
    | 'function'
    | 'undefined'
    | 'string'
    | 'number'
    | 'boolean'
    | 'symbol'
    | 'bigint';
  subtype?:
    | 'array'
    | 'null'
    | 'node'
    | 'regexp'
    | 'date'
    | 'map'
    | 'set'
    | 'weakmap'
    | 'weakset'
    | 'iterator'
    | 'generator'
    | 'error'
    | 'proxy'
    | 'promise'
    | 'typedarray'
    | 'arraybuffer'
    | 'dataview';

  className?: string;
  value?: any;
  unserializableValue?: 'UnserializableValue';
  description?: string;
  objectId?: 'RemoteObjectId';
  preview?: 'ObjectPreview';
  customPreview?: 'CustomPreview';
}

interface Scope {
  type:
    | 'global'
    | 'local'
    | 'with'
    | 'closure'
    | 'catch'
    | 'block'
    | 'script'
    | 'eval'
    | 'module';
  object: RemoteObject;

  name?: string;
  startLocation?: Location;
  endLocation?: Location;
}

type CallFrameId = string;

interface CallFrame {
  callFrameId: CallFrameId;
  functionName: string;
  functionLocation?: Location;
  location: Location;
  url: string;
  scopeChain: Scope[];
  this: RemoteObject;
  returnValue?: RemoteObject;
}

type UniqueDebuggerId = string;

interface StackTraceId {
  id: string;
  debuggerId?: UniqueDebuggerId;
}

interface StackTrace {
  description?: string;
  callFrames: CallFrame[];
  parent?: StackTrace;
  parentId?: StackTraceId;
}

type ScriptId = string;

interface ExceptionDetails {
  exceptionId: number;
  text: string;
  lineNumber: number;
  columnNumber: number;
  scriptId?: ScriptId;
  url?: string;
  stackTrace?: 'StackTrace';
  exception?: RemoteObject;
  executionContextId?: 'ExecutionContextId';
}
