# Shared projects

A person clicks **Share Project** (top right), names the project and gets a uuid. Anyone with that uuid sees the same project live, and an AI agent can drive it through the same commands (the MCP server, stretch 8, is built on this).

## Rules
- **The uuid is the only key.** It is a v4 uuid made by the Worker (`crypto.randomUUID()`, 122 random bits). There is no list, search or index of projects on the server, no accounts and no password beyond the weekend site gate. Whoever has the uuid can read and change the project. This is a deliberate choice for the hackathon, not a gap. The browser remembers the projects it has opened (`localStorage`), and the uuid lives in the URL hash (`#project=<uuid>`), which is never sent to a server.
- **Data is always shared; view is shared only while "Follow the group's view" is on.** Data: the selected site, landing date, its slip from the planned landing (`slip`, whole days; the plan is the date less the slip, and it is what the planner's "what the slip cost" comparison is made against), window, observer height, power system, and the project's sites. View: the tab, the mode (Mission, Explore, or Explore with the guide open, which the state calls `learn`), the chart's centre and time cursor, the Moon's layer, graticule and camera. The switch is per person (`localStorage`); off means a person neither sends nor receives view changes, and data still flows. Switching it on jumps to where the group is. The theme (dark/light) is never shared.
- **Sites are owned by the project.** `addSite` and `removeSite` go to the Durable Object, which names the site (`id` unique among the project's and the published ones), selects it, and sends the list to everyone, the asker too. Up to 50 sites per project.
- **A project's site can have its own data.** A site in a project has a `status`: absent (a name and a position), `computing`, `ready` or `failed`, and when ready an `approx` flag (false when 5 m terrain lies under it). Only the Durable Object sets these, when a pipeline run is asked for and when it reports back (`api/CONTEXT.md`, "Computing a project's site"); no command can, so a browser or an agent cannot claim a site is computed. A change of status goes to everyone as a `sites` event, like an added site. A `ready` site is drawn like a published one (lights, chart, battery, planner row, map), from its file at `/api/projects/<uuid>/sites/<id>.json`. Sites uploaded when a project is created start with no status: computed data belongs to the project it was computed in.
- **Creating uploads the temporary data**: the sites added in this browser, and the current data and view, so the project starts exactly as the creator sees it. The browser's own copies stay where they are.
- Last write wins, per key. The server drops invalid values and ignores changes that change nothing, which is what stops two pages echoing a change back and forth.

## Where it lives
| What | Where |
|---|---|
| Rules: validation, `reduce(state, command)` | `api/src/project-state.ts` (pure; the browser imports its types) |
| The Durable Object (one per uuid, SQLite-backed, WebSocket hibernation) | `api/src/project.ts` |
| Routes | `api/src/index.ts`, see `api/CONTEXT.md` |
| The MCP server (protocol and tools) | `api/src/mcp.ts` |
| Computing a site: starting the run, taking the result | `api/src/pipeline.ts`; `startCompute` / `finishCompute` in `api/src/project.ts` |
| Browser connection, REST calls, remembered projects | `web/src/sync.ts` |
| The button and dialog | `web/src/share.ts`, markup `#share` in `web/index.html` |
| Collecting, diffing and applying page state | "shared project" block in `web/src/main.ts` |
| Tests | `api/tests/project.test.ts` (rules, the object with fake storage, the routes); `api/tests/mcp.test.ts` (protocol, every tool, the `/mcp` route); `e2e/share.spec.ts` (two real browsers) |

## Wire protocol (JSON; the same commands go down a WebSocket and into the REST route)
Commands (to the project):
- `{t:'set', data?:{site,date,slip,days,height,preset,power}, view?:{tab,mode,centre,time,layer,grid,cam}}`
- `{t:'addSite', name, lat, lon_e}` · `{t:'removeSite', id, fallback?}`

Events (to every browser): `{t:'snapshot', ...project, peers}` on connect; `{t:'set', data?, view?}` (not sent back to the sender); `{t:'sites', sites, data?}` (to everyone); `{t:'peers', n}`; `{t:'error', error}`. Values are strings where the page's controls hold strings (`days:'14'`); `power` is `array_day_dark_battery` as in the URL hash, or `''`; `cam` is `{lon,lat,D,bearing,pitch}`. Limits and every pattern are in `project-state.ts`.

## The MCP server
Tell an AI agent to use the Four Lights MCP and give it a project uuid; it then reads the project, answers questions from the published data, and changes what everyone sees. Every change is a project command sent to the project's Durable Object, the same path the browsers use, so there is one set of rules and every open page updates at once.

- **Connect:** MCP "Streamable HTTP", stateless (each POST is a JSON-RPC message, the answer is JSON; no sessions, no SSE, no SDK). URL `https://fourlights.gcsa.space/mcp`, or `/mcp/<uuid>` to bind a connection to one project so the agent need not pass it. No credentials (the weekend password came off on Sun 15 Nov). Example (Claude Code): `claude mcp add --transport http fourlights https://fourlights.gcsa.space/mcp/<uuid>`. Otherwise tell the agent "use the fourlights MCP, project <uuid>"; every tool takes `project`.
- **Tools** (`api/src/mcp.ts`):

| Tool | Does |
|---|---|
| `get_project` | the whole project: name, added sites, selection, shared view |
| `list_sites` | the 12 published sites and the project's own |
| `site_summary` | one site on one date: usable days, sunlit %, longest dark, power verdict, its written review |
| `rank_sites` | every published site for a date and window, best first |
| `set_selection` | site, landing date, slip from the plan in days (a date with no slip is a new plan), window (7/14/30), observer height (1/2/5) |
| `switch_tab` | show a tab by slug or label (the five tabs are the same in every view; the Learn view's teaching content is its guide panel, not tabs) |
| `set_view` | mode, chart centre and time cursor, Moon layer, graticule |
| `add_site` · `remove_site` | add a site by name and lat/lon (it becomes the selection); remove one of the project's own |

- **Questions** are answered from `planner.json` and `reviews.json` (read through the assets binding, cached per isolate), so figures are for the published sites at a 2 m observer. Sites added to a project have no precomputed figures: the agent is told so.
- **View changes** (`switch_tab`, `set_view`) reach only people whose "Follow the group's view" switch is on; **data changes** reach everyone. The tool text says so.
- A tool's failure comes back as an `isError` result the agent can read (unknown site, bad date, missing project), never a protocol error. Tab slugs are those in `web/src/tabs.ts`.
- Same trust model as the REST route: the uuid is the key. Tools can read and change that one project and nothing else.
- REST equivalents, for scripts: `GET /api/projects/<uuid>` and `POST /api/projects/<uuid>/commands`.

## Keeping the project state up to date (read this before adding a feature)
A shared project only stays useful if everything a person can change on the page that matters to the group is either in the project's state or deliberately left out. **Every new feature that adds page state, a setting, a tab or a site property must make this decision, and record it in its build-log row ("shared: data / view / not shared, because ...").**

Decide first: is it **data** (what the project *is*; always shared), **view** (where a person is *looking*; shared only while following), or **local** (theme, scroll, open panels, anything private; never shared, and say so under Rules)?

Then, for data or view, change all of these together:
1. `api/src/project-state.ts`: add the key to `DataState` or `ViewState`, its default to `DEFAULT_DATA` / `DEFAULT_VIEW`, and a validator in `DATA_RULES` / `VIEW_RULES`. Both rule tables are typed over every key, so the compiler flags a missing one. Nothing arrives unvalidated: the uuid holder may be an agent.
2. `web/src/main.ts`, "shared project" block: read it in `collectData()` / `collectView()`, and put someone else's change on the page in `applyData()` / `applyView()`. Applying must set `applying` so it does not echo back; no handler needs a hook, because the page diffs against `lastData` / `lastView`.
3. A new **site property** (not just a new setting): `ProjectSite`, `makeSite`, `cleanSites` and `fromProject()` in `main.ts`, plus the `addSite` command and the `add_site` tool.
4. `api/src/mcp.ts`: let the agent read it (`get_project` returns the state) and change it (extend `set_selection` / `set_view`, or add a tool). Tool text must say whether it reaches everyone (data) or followers only (view). Update the tool table above.
5. Tests: the rules in `api/tests/project.test.ts` (valid, invalid, no-op), the tool in `api/tests/mcp.test.ts`, and, if a person can change it on the page, a two-browser case in `e2e/share.spec.ts`.
6. Docs: the Rules section and wire protocol above, the tool table, the "Where it lives" table if a file is new, and the route/tool lines in `api/CONTEXT.md` and `web/CONTEXT.md`.

**Existing projects keep their old shape.** The Durable Object merges what it stored over `DEFAULT_DATA` / `DEFAULT_VIEW` when it loads, so adding a key is safe: old projects get the default. Renaming, removing or changing the meaning of a key is not: existing uuids are in people's links. Keep the old key working, or write a conversion in `project.ts`'s load step with a test. A new stored shape that cannot be merged needs a Durable Object **migration** in `wrangler.jsonc` (the current tag is `v1`; a new SQLite class or a renamed or deleted class needs a new tag). Never edit a migration that has been deployed.

## Not done
No MCP tool starts a pipeline run for a site, and `site_summary` / `rank_sites` still answer only for the published sites (a run costs machine time, so starting one is left to a person pressing the button). No rename or delete of a project, no read-only links, no history, no per-person cursors or names. Edits made while a person is offline are replaced by the project's state when they reconnect (an add or remove is queued and replayed).
