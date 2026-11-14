// Writes web/public/data/planner.json: the Slip Planner's figures for every site, window and
// landing day, so the page can colour the grid from one small file instead of every site file.
// Uses the app's own rules (web/src/summary.ts, lights.ts). Run after the site files change:
//   npm run planner-data
import { readFileSync, writeFileSync } from 'node:fs';
import { buildSummary } from '../web/src/summary.ts';

const root = 'web/public/data';
const index = JSON.parse(readFileSync(`${root}/sites.json`, 'utf8'));
const sites = index.map((s) => JSON.parse(readFileSync(`${root}/sites/${s.id}.json`, 'utf8')));
const summary = buildSummary(sites);
const out = `${root}/planner.json`;
writeFileSync(out, JSON.stringify(summary) + '\n');
const days = Object.values(Object.values(summary.windows)[0])[0].u.length;
console.log(
  `Wrote ${out}: ${sites.length} sites x ${Object.keys(summary.windows).length} windows x ${days} days`,
);
