# Shared projects

A person clicks **Share Project** (top right), names the project and gets a uuid. Anyone with that uuid sees the same project live, and an AI agent can drive it through the same commands (the MCP server, stretch 8, is built on this).

## Rules
- **The uuid is the only key.** It is a v4 uuid made by the Worker (`crypto.randomUUID()`, 122 random bits). There is no list, search or index of projects on the server, no accounts and no password beyond the weekend site gate. Whoever has the uuid can read and change the project. This is a deliberate choice for the hackathon, not a gap. The browser remembers the projects it has opened (`localStorage`), and the uuid lives in the URL hash (`#project=<uuid>`), which is never sent to a server.
- **Data is always shared; view is shared only while "Follow the group's view" is on.** Data: the selected site, landing date, window, observer height, power system, and the project's sites. View: the tab, Mission/Explore/Learn, the chart's centre and time cursor, the Moon's layer, graticule and camera. The switch is per person (`localStorage`); off means a person neither sends nor receives view changes, and data still flows. Switching it on jumps to where the group is. The theme (dark/light) is never shared.
- **Sites are owned by the project.** `addSite` and `removeSite` go to the Durable Object, which names the site (`id` unique among the project's and the published ones), selects it, and sends the list to everyone, the asker too. Up to 50 sites per project.
- **Creating uploads the temporary data**: the sites added in this browser, and the current data and view, so the project starts exactly as the creator sees it. The browser's own copies stay where they are.
- Last write wins, per key. The server drops invalid values and ignores changes that change nothing, which is what stops two pages echoing a change back and forth.

## Where it lives
| What | Where |
|---|---|
| Rules: validation, `reduce(state, command)` | `api/src/project-state.ts` (pure; the browser imports its types) |
| The Durable Object (one per uuid, SQLite-backed, WebSocket hibernation) | `api/src/project.ts` |
| Routes | `api/src/index.ts`, see `api/CONTEXT.md` |
| The MCP server (protocol and tools) | `api/src/mcp.ts` |
| Browser connection, REST calls, remembered projects | `web/src/sync.ts` |
| The button and dialog | `web/src/share.ts`, markup `#share` in `web/index.html` |
| Collecting, diffing and applying page state | "shared project" block in `web/src/main.ts` |
| Tests | `api/tests/project.test.ts` (rules, the object with fake storage, the routes); `api/tests/mcp.test.ts` (protocol, every tool, the `/mcp` route); `e2e/share.spec.ts` (two real browsers) |

## Wire protocol (JSON; the same commands go down a WebSocket and into the REST route)
Commands (to the project):
- `{t:'set', data?:{site,date,days,height,preset,power}, view?:{tab,mode,centre,time,layer,grid,cam}}`
- `{t:'addSite', name, lat, lon_e}` · `{t:'removeSite', id, fallback?}`

Events (to every browser): `{t:'snapshot', ...project, peers}` on connect; `{t:'set', data?, view?}` (not sent back to the sender); `{t:'sites', sites, data?}` (to everyone); `{t:'peers', n}`; `{t:'error', error}`. Values are strings where the page's controls hold strings (`days:'14'`); `power` is `array_day_dark_battery` as in the URL hash, or `''`; `cam` is `{lon,lat,D,bearing,pitch}`. Limits and every pattern are in `project-state.ts`.

## The MCP server
Tell an AI agent to use the Four Lights MCP and give it a project uuid; it then reads the project, answers questions from the published data, and changes what everyone sees. Every change is a project command sent to the project's Durable Object, the same path the browsers use, so there is one set of rules and every open page updates at once.

- **Connect:** MCP "Streamable HTTP", stateless (each POST is a JSON-RPC message, the answer is JSON; no sessions, no SSE, no SDK). URL `https://fourlights.gcsa.space/mcp`, or `/mcp/<uuid>` to bind a connection to one project so the agent need not pass it. While the weekend gate is on, the client sends Basic Auth: user `fourlights`, the site password. Example (Claude Code): `claude mcp add --transport http fourlights https://fourlights.gcsa.space/mcp/<uuid> --header "Authorization: Basic <base64 fourlights:password>"`. Otherwise tell the agent "use the fourlights MCP, project <uuid>"; every tool takes `project`.
- **Tools** (`api/src/mcp.ts`):

| Tool | Does |
|---|---|
| `get_project` | the whole project: name, added sites, selection, shared view |
| `list_sites` | the 12 published sites and the project's own |
| `site_summary` | one site on one date: usable days, sunlit %, longest dark, power verdict, its written review |
| `rank_sites` | every published site for a date and window, best first |
| `set_selection` | site, landing date, window (7/14/30), observer height (1/2/5) |
| `switch_tab` | show a tab by slug or label; a Learn-only tab also switches to Learn |
| `set_view` | mode, chart centre and time cursor, Moon layer, graticule |
| `add_site` · `remove_site` | add a site by name and lat/lon (it becomes the selection); remove one of the project's own |

- **Questions** are answered from `planner.json` and `reviews.json` (read through the assets binding, cached per isolate), so figures are for the published sites at a 2 m observer. Sites added to a project have no precomputed figures: the agent is told so.
- **View changes** (`switch_tab`, `set_view`) reach only people whose "Follow the group's view" switch is on; **data changes** reach everyone. The tool text says so.
- A tool's failure comes back as an `isError` result the agent can read (unknown site, bad date, missing project), never a protocol error. Tab slugs are those in `web/src/tabs.ts`.
- Same trust model as the REST route: the uuid is the key. Tools can read and change that one project and nothing else.
- REST equivalents, for scripts: `GET /api/projects/<uuid>` and `POST /api/projects/<uuid>/commands`.

## Not done
No rename or delete of a project, no read-only links, no history, no per-person cursors or names. Edits made while a person is offline are replaced by the project's state when they reconnect (an add or remove is queued and replayed).
