const MAX_ROWS = 30;

let panel: HTMLDivElement | null = null;
let list: HTMLDivElement | null = null;
let toggleBtn: HTMLButtonElement | null = null;
let visible = true;

const ensureMounted = () => {
  if (panel) return;
  panel = document.createElement('div');
  panel.id = '__debug-overlay';
  panel.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'right:0',
    'max-height:45vh',
    'overflow:auto',
    'background:rgba(0,0,0,0.82)',
    'color:#0f0',
    'font:11px/1.3 monospace',
    'padding:4px 6px 20px 6px',
    'z-index:999999',
    'white-space:pre-wrap',
    'word-break:break-all',
  ].join(';');

  toggleBtn = document.createElement('button');
  toggleBtn.textContent = 'DEBUG ▲ (hide)';
  toggleBtn.style.cssText = [
    'position:fixed',
    'top:2px',
    'right:2px',
    'z-index:1000000',
    'background:#222',
    'color:#fff',
    'border:1px solid #0f0',
    'padding:2px 6px',
    'font:10px monospace',
  ].join(';');
  toggleBtn.onclick = () => {
    visible = !visible;
    if (panel) panel.style.display = visible ? 'block' : 'none';
    if (toggleBtn) toggleBtn.textContent = visible ? 'DEBUG ▲ (hide)' : 'DEBUG ▼ (show)';
  };

  list = document.createElement('div');
  panel.appendChild(list);
  document.body.appendChild(panel);
  document.body.appendChild(toggleBtn);
};

export const debugLog = (line: string, color: string = '#0f0') => {
  try {
    ensureMounted();
    if (!list) return;
    const row = document.createElement('div');
    row.style.color = color;
    const ts = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    row.textContent = `[${ts}] ${line}`;
    list.appendChild(row);
    while (list.children.length > MAX_ROWS) {
      list.removeChild(list.firstChild!);
    }
    panel?.scrollTo({ top: panel.scrollHeight });
  } catch {
    /* ignore */
  }
};

export const installFetchDebug = () => {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { __fetchDebugInstalled?: boolean };
  if (w.__fetchDebugInstalled) return;
  w.__fetchDebugInstalled = true;

  ensureMounted();
  debugLog(`apiBase=${import.meta.env.VITE_API_BASE ?? '(none)'} DEV=${import.meta.env.DEV}`, '#ff0');

  const origFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const input = args[0];
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request)?.url ?? String(input);
    const isApi =
      /terry-auction-proxy|\/api-(data|onbid|naver|geo|kakao|osrm|court|drive)/.test(url);
    if (isApi) debugLog(`→ ${url}`, '#0ff');
    try {
      const res = await origFetch(...args);
      if (isApi) debugLog(`${res.ok ? '✓' : '✗'} ${res.status} ${url}`, res.ok ? '#0f0' : '#f80');
      return res;
    } catch (err) {
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      if (isApi || /https?:\/\//.test(url)) debugLog(`✗ FETCH-FAIL ${msg} ${url}`, '#f33');
      throw err;
    }
  };

  window.addEventListener('error', (ev) => {
    debugLog(`JS ERR: ${ev.message} @ ${ev.filename}:${ev.lineno}`, '#f33');
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const r = ev.reason;
    const msg = r instanceof Error ? `${r.name}: ${r.message}` : String(r);
    debugLog(`UNHANDLED: ${msg}`, '#f33');
  });
};
