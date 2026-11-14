// The data-sources page: shared styles, and the same dark/light choice as the app.
import './style.css';

try {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark' || saved === 'light') document.documentElement.dataset.theme = saved;
} catch {
  // storage blocked: follow the device
}
