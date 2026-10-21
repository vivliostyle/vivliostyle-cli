import { x } from 'tinyexec';

/** Opens a URL in the user's default browser. */
export async function openUrl(url: string): Promise<void> {
  let command = 'xdg-open';
  let args = [url];
  if (process.platform === 'darwin') {
    command = 'open';
  } else if (process.platform === 'win32') {
    // `start` would need the URL to be escaped for cmd.exe.
    command = 'rundll32';
    args = ['url.dll,FileProtocolHandler', url];
  }
  await x(command, args, {
    throwOnError: true,
    nodeOptions: { stdio: 'ignore' },
  });
}
