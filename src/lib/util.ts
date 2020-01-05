import { statPromise } from './misc';

export function log(...obj: any) {
  console.log('===>', ...obj);
}

export function statFile(filePath: string) {
  return statPromise(filePath).catch((err) => {
    if (err.code === 'ENOENT') {
      throw new Error(`Specified input doesn't exists: ${filePath}`);
    }
    throw err;
  });
}
