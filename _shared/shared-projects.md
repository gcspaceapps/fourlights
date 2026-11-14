# Shared projects

A person clicks **Share Project** (top right), names the project and gets a uuid. Anyone with that uuid sees the same project live, and an AI agent can drive it through the same commands (MCP, stretch 8, is built on this; the MCP server itself is not written yet).

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
| Browser connection, REST calls, remembered projects | `web/src/sync.ts` |
| The button and dialog | `web/src/share.ts`, markup `#share` in `web/index.html` |
| Collecting, diffing and applying page state | "shared project" block in `web/src/main.ts` |
| Tests | `api/tests/project.test.ts` (rules, the object with fake storage, the routes); `e2e/share.spec.ts` (two real browsers) |

## Wire protocol (JSON; the same commands go down a WebSocket and into the REST route)
Commands (to the project):
- `{t:'set', data?:{site,date,days,height,preset,power}, view?:{tab,mode,centre,time,layer,grid,cam}}`
- `{t:'addSite', name, lat, lon_e}` · `{t:'removeSite', id, fallback?}`

Events (to every browser): `{t:'snapshot', ...project, peers}` on connect; `{t:'set', data?, view?}` (not sent back to the sender); `{t:'sites', sites, data?}` (to everyone); `{t:'peers', n}`; `{t:'error', error}`. Values are strings where the page's controls hold strings (`days:'14'`); `power` is `array_day_dark_battery` as in the URL hash, or `''`; `cam` is `{lon,lat,D,bearing,pitch}`. Limits and every pattern are in `project-state.ts`.

## For the MCP server (next)
- Read: `GET /api/projects/<uuid>` → `{ok, project:{id,name,sites,data,view}}`.
- Act: `POST /api/projects/<uuid>/commands` with a command above. "Show me the planner" is `{t:'set', view:{tab:'planner'}}`; "change the date" is `{t:'set', data:{date:'2028-05-02'}}`; "add a site" is `addSite`. Everyone connected sees it at once, whatever their follow switch says for view changes (an agent's view command reaches only people who are following).
- The tab slugs are those in `web/src/tabs.ts` (the lower-cased tab label with dashes); site ids are in `/data/sites.json` or the project's `sites`.
- The route is behind the weekend password gate like everything else; an MCP client sends the same Basic Auth.

## Not done
No rename or delete of a project, no read-only links, no history, no per-person cursors or names. Edits made while a person is offline are replaced by the project's state when they reconnect (an add or remove is queued and replayed).
