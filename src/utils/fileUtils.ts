import fs from 'fs';
import { promisify } from 'util';

export const unlinkAsync = promisify(fs.unlink);
