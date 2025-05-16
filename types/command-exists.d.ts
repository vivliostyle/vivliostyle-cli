declare module 'command-exists' {
  export default commandExists;

  function commandExists(commandName: string): Promise<string>;
  function commandExists(
    commandName: string,
    cb: (error: null, exists: boolean) => void,
  ): void;

  namespace commandExists {
    function sync(commandName: string): boolean;
  }

  function commandExists(command: string): Promise<boolean>;
}
