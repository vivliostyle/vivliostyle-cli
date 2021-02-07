import xmlParser from 'fast-xml-parser';
import fs from 'fs';
import path from 'upath';
import { inflateZip, useTmpDirectory } from './util';

const pickFirstOne = <T>(arg: T | T[]): T =>
  Array.isArray(arg) ? arg[0] : arg;

export async function openEpubToTmpDirectory(
  filePath: string,
): Promise<{
  dest: string;
  epubOpfPath: string;
  deleteEpub: () => void;
}> {
  const [tmpDir, deleteEpub] = await useTmpDirectory();
  await inflateZip(filePath, tmpDir);

  const containerXmlPath = path.join(tmpDir, 'META-INF/container.xml');
  const { container } = xmlParser.parse(
    fs.readFileSync(containerXmlPath, 'utf8'),
    {
      ignoreAttributes: false,
    },
  );
  const rootfile = pickFirstOne(container.rootfiles.rootfile); // Only supports a default rendition
  const epubOpfPath = path.join(tmpDir, rootfile['@_full-path']);
  return { dest: tmpDir, epubOpfPath, deleteEpub };
}
