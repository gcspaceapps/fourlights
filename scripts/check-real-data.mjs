// Fails if any fake fixture file is still in the published data. Run before the real demo ships.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = 'web/public/data';
const hits = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.startsWith('fake-')) hits.push(p);
  }
};
walk(root);
if (hits.length) {
  console.error(`Fake data still published:\n${hits.join('\n')}`);
  process.exit(1);
}
console.log('No fake data in web/public/data.');
