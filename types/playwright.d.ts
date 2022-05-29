declare module 'playwright-core/lib/server' {
  export type BrowserName = 'chromium' | 'firefox' | 'webkit';
  type InternalTool =
    | 'ffmpeg'
    | 'firefox-beta'
    | 'chromium-with-symbols'
    | 'chromium-tip-of-tree';
  type ChromiumChannel =
    | 'chrome'
    | 'chrome-beta'
    | 'chrome-dev'
    | 'chrome-canary'
    | 'msedge'
    | 'msedge-beta'
    | 'msedge-dev'
    | 'msedge-canary';

  export interface Executable {
    type: 'browser' | 'tool' | 'channel';
    name: BrowserName | InternalTool | ChromiumChannel;
    browserName: BrowserName | undefined;
    installType:
      | 'download-by-default'
      | 'download-on-demand'
      | 'install-script'
      | 'none';
    directory: string | undefined;
    executablePathOrDie(sdkLanguage?: string): string;
    executablePath(sdkLanguage?: string): string | undefined;
    validateHostRequirements(sdkLanguage: string): Promise<void>;
  }

  class Registry {
    executables(): Executable[];
    findExecutable(name: BrowserName): Executable;
    findExecutable(name: string): Executable | undefined;
    defaultExecutables(): Executable[];
    installDeps(
      executablesToInstallDeps: Executable[],
      dryRun: boolean,
    ): Promise<void>;
    install(
      executablesToInstall: Executable[],
      forceReinstall: boolean,
    ): Promise<void>;
  }

  export const registry: Registry;
}
