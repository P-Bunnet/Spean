import { useSyncExternalStore } from 'react';
import { SaveSettings, Settings } from '../../wailsjs/go/main/App';
import { config } from '../../wailsjs/go/models';
import type { ITheme } from '@xterm/xterm';

// Terminal theme presets. `accent` retints the UI so the two never clash.
export const themes: Record<string, { term: ITheme; accent: string; light?: boolean }> = {
  'Spean Dark': { term: { background: '#0a0a0a', foreground: '#e5e5e5', cursor: '#38bdf8', selectionBackground: '#38bdf844' }, accent: '#38bdf8' },
  'Solarized Dark': {
    term: {
      background: '#002b36', foreground: '#839496', cursor: '#93a1a1', selectionBackground: '#073642',
      black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900', blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
      brightBlack: '#002b36', brightRed: '#cb4b16', brightGreen: '#586e75', brightYellow: '#657b83', brightBlue: '#839496', brightMagenta: '#6c71c4', brightCyan: '#93a1a1', brightWhite: '#fdf6e3',
    },
    accent: '#2aa198',
  },
  'GitHub Light': {
    term: {
      background: '#ffffff', foreground: '#24292f', cursor: '#0969da', selectionBackground: '#0969da33',
      black: '#24292f', red: '#cf222e', green: '#116329', yellow: '#4d2d00', blue: '#0969da', magenta: '#8250df', cyan: '#1b7c83', white: '#6e7781',
      brightBlack: '#57606a', brightRed: '#a40e26', brightGreen: '#1a7f37', brightYellow: '#633c01', brightBlue: '#218bff', brightMagenta: '#a475f9', brightCyan: '#3192aa', brightWhite: '#8c959f',
    },
    accent: '#0969da',
    light: true,
  },
};

let current: config.Settings | null = null;
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

export async function loadSettings() {
  current = await Settings();
  notify();
}
export async function saveSettings(s: config.Settings) {
  await SaveSettings(s);
  current = s;
  notify();
}
/** Apply without saving (live preview in the settings dialog). */
export function previewSettings(s: config.Settings) {
  current = s;
  notify();
}
export function useSettings(): config.Settings | null {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => current,
  );
}
