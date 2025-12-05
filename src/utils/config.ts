import fs from 'fs';
import path from 'path';

const configFile = fs.readFileSync(path.join('config.json'), 'utf-8');
export const config = JSON.parse(configFile);