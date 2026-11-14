// The "how we built it" page: shared styles, the app's dark/light choice, and Mermaid diagrams.
import mermaid from 'mermaid';
import './style.css';

try {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark' || saved === 'light') document.documentElement.dataset.theme = saved;
} catch {
  // storage blocked: follow the device
}

const forced = document.documentElement.dataset.theme;
const dark = forced ? forced === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;

mermaid.initialize({
  startOnLoad: false,
  theme: dark ? 'dark' : 'neutral',
  fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
  flowchart: { htmlLabels: true, curve: 'basis' },
});
void mermaid.run({ querySelector: 'pre.mermaid' });
