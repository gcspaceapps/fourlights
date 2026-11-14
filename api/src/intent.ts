// Plain-English query: the language model only turns a question into planner settings.
// Everything it returns is validated here; the answer itself comes from the planner's maths.

export const ASK_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export const MAX_QUESTION_CHARS = 200;
const WINDOWS = [7, 14, 30];
const MAX_SLIP_DAYS = 60;

export interface SiteName {
  id: string;
  name: string;
}

export interface Intent {
  /** Planned landing date before any slip, YYYY-MM-DD, or null to keep the current one. */
  date: string | null;
  /** Days the launch slips (0 if none mentioned). */
  slip_days: number;
  /** Mission window, or null to keep the current one. */
  window_days: number | null;
  /** A site to open in the Sun-Path Chart, or null. */
  site: string | null;
}

export function systemPrompt(sites: SiteName[], firstDay: string, lastDay: string): string {
  return [
    'You turn a question about lunar south-pole landing sites into settings for a planning tool.',
    'Reply with ONE JSON object and nothing else, with exactly these keys:',
    '"date": the planned landing date as YYYY-MM-DD, before any slip or delay, or null if none is given;',
    '"slip_days": whole days the launch slips or is delayed (0 if not mentioned; a week is 7);',
    '"window_days": the mission length in days if given, as one of 7, 14 or 30 (nearest), else null;',
    '"site": the id of ONE site if the question is about a particular site, else null.',
    `Dates must be between ${firstDay} and ${lastDay}. If no year is given, use 2028.`,
    'Sites (id: name): ' + sites.map((s) => `${s.id}: ${s.name}`).join('; ') + '.',
    'If the question names no landing date, "date" MUST be null: never invent or default one.',
    'Examples:',
    '"Launch slips 3 days from 19 April" -> {"date":"2028-04-19","slip_days":3,"window_days":null,"site":null}',
    '"we are delayed a week" -> {"date":null,"slip_days":7,"window_days":null,"site":null}',
    '"show me Haworth for a month" -> {"date":null,"slip_days":0,"window_days":30,"site":"haworth"}',
    'Never answer the question itself.',
  ].join('\n');
}

/** Pull the first JSON object out of a model reply and validate every field. */
export function parseIntent(
  reply: string,
  sites: SiteName[],
  firstDay: string,
  lastDay: string,
): Intent | null {
  const m = /\{[\s\S]*\}/.exec(reply);
  if (!m) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(m[0]);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;

  let date: string | null = null;
  if (typeof o.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.date)) {
    const t = Date.parse(`${o.date}T00:00:00Z`);
    if (!Number.isNaN(t) && o.date >= firstDay && o.date <= lastDay) date = o.date;
  }
  const slip = Number(o.slip_days);
  const slip_days = Number.isInteger(slip) && slip >= 0 && slip <= MAX_SLIP_DAYS ? slip : 0;
  const win = Number(o.window_days);
  const window_days = WINDOWS.includes(win) ? win : null;
  const site = typeof o.site === 'string' && sites.some((s) => s.id === o.site) ? o.site : null;
  if (date === null && slip_days === 0 && window_days === null && site === null) return null;
  return { date, slip_days, window_days, site };
}
