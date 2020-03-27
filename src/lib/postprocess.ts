import fs from 'fs';
import path from 'path';
import os from 'os';
import uuid from 'uuid/v1';
import * as pressReadyModule from 'press-ready';

export interface SaveOption {
  pressReady: boolean;
}

export class PostProcess {
  static async load(pdf: Buffer): Promise<PostProcess> {
    return new PostProcess(pdf);
  }

  private constructor(private pdf: Buffer) {}

  async save(output: string, { pressReady = false }: SaveOption) {
    const input = pressReady
      ? path.join(os.tmpdir(), `vivliostyle-cli-${uuid()}.pdf`)
      : output;

    const pdf = this.pdf;
    await fs.promises.writeFile(input, pdf);

    if (pressReady) {
      await pressReadyModule.build({ input, output });
    }
  }
}
