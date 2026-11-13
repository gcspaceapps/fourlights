import './style.css';

type Health = { ok: boolean; built: string };

async function showHealth(): Promise<void> {
  const el = document.getElementById('health');
  if (!el) return;
  try {
    const res = await fetch('/api/health');
    const body = (await res.json()) as Health;
    el.textContent = body.ok ? `ok (${body.built})` : 'not ok';
  } catch {
    el.textContent = 'unreachable';
  }
}

void showHealth();
