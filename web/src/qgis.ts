// The "Open in QGIS" page: shared styles, the same dark/light choice as the app, and the table
// of layer files with their full addresses (built from this page's own address, so it is right
// on any copy of the site).
import './style.css';

try {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark' || saved === 'light') document.documentElement.dataset.theme = saved;
} catch {
  // storage blocked: follow the device
}

const FGB = 'FlatGeobuf';
const COG = 'Cloud Optimized GeoTIFF';

/** The files of the QGIS pack (pipeline/qgis-pack.sh), in the order of the project's layers. */
export const QGIS_FILES: readonly (readonly [name: string, file: string, format: string])[] = [
  ['Sites, with the planned and slipped verdicts', 'sites.fgb', FGB],
  ['Landing day: every site on every landing day', 'planner_daily.fgb', FGB],
  ['Skyline around each site', 'skyline.fgb', FGB],
  ['Direction of the Earth', 'earth_lines.fgb', FGB],
  ['Artemis regions (USGS grids)', 'regions.fgb', FGB],
  ['Contours, 1000 m', 'contours.fgb', FGB],
  ['Height (LOLA 240 m, resampled to 420 m)', 'dem.cog.tif', COG],
  ['Hillshade', 'hillshade.cog.tif', COG],
  ['Height, 20 m', 'r2/dem-20m.cog.tif', COG],
  ['Hillshade, 20 m', 'r2/hillshade-20m.cog.tif', COG],
  ['Slope, 20 m', 'r2/slope-20m.cog.tif', COG],
  ['Pipeline check: tile and region centres', 'site_centres.fgb', FGB],
  ['Pipeline check: DEM rings', 'dem_rings.fgb', FGB],
];

/** The address QGIS should be given for a file of the pack. */
export function layerAddress(origin: string, file: string): string {
  return `${origin}/qgis/${file}`;
}

const body = document.getElementById('qgis-files');
if (body) {
  for (const [name, file, format] of QGIS_FILES) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = name;
    const address = document.createElement('td');
    const code = document.createElement('code');
    code.textContent = layerAddress(location.origin, file);
    address.appendChild(code);
    const kind = document.createElement('td');
    kind.textContent = format;
    tr.append(th, address, kind);
    body.appendChild(tr);
  }
}
