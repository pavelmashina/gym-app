// The app theme on <html data-theme>: 'light' or 'dark'.
// «Как в системе» ('system') is resolved here to the phone's current mode and follows it while
// the app is open, so every `html[data-theme='dark']` rule also serves it. Before this, 'system'
// reached <html> as is: only the colour tokens followed the phone, and the dark rules of the
// components never applied (a light «Питание» card under light text on the home screen).
// The chosen value itself stays 'system' in the settings and in localStorage.

const DARK_QUERY = '(prefers-color-scheme: dark)';

let chosenTheme = 'light';
let systemDark = null;

export function resolveTheme(theme, prefersDark) {
  if (theme === 'dark') return 'dark';
  if (theme === 'system') return prefersDark ? 'dark' : 'light';
  return 'light';
}

function render() {
  document.documentElement.dataset.theme = resolveTheme(chosenTheme, Boolean(systemDark?.matches));
}

function watchSystemTheme() {
  if (systemDark || typeof window.matchMedia !== 'function') return;
  systemDark = window.matchMedia(DARK_QUERY);
  const onChange = () => { if (chosenTheme === 'system') render(); };
  // Safari before 14 knows only addListener.
  if (typeof systemDark.addEventListener === 'function') systemDark.addEventListener('change', onChange);
  else systemDark.addListener?.(onChange);
}

export function applyTheme(theme) {
  chosenTheme = theme === 'dark' || theme === 'system' ? theme : 'light';
  if (chosenTheme === 'system') watchSystemTheme();
  render();
}
