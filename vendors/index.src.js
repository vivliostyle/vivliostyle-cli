import tmp from 'tmp';
import { copy, copySync } from '../node_modules/fs-extra/lib/copy/index.js';
import { move, moveSync } from '../node_modules/fs-extra/lib/move/index.js';
import {
  remove,
  removeSync,
} from '../node_modules/fs-extra/lib/remove/index.js';

export { copy, copySync, move, moveSync, remove, removeSync, tmp };
