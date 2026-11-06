import { useSyncExternalStore } from 'react';
import { SaveSettings, Settings } from '../../wailsjs/go/main/App';
import { config } from '../../wailsjs/go/models';
import type { ITheme } from '@xterm/xterm';

export type Theme = { term: ITheme; accent: string; accent2: string; light?: boolean; playful?: boolean; icons?: 'duotone' | 'pixel' | 'bold'; radius?: string; retro?: boolean };

const ANSI = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'] as const;

// ansi: 16 colours in ANSI order, space separated. accent and accent2 retint the app chrome (see applyTheme).
const theme = (background: string, foreground: string, cursor: string, selectionBackground: string, ansi: string, accent: string, accent2: string, flags?: Partial<Theme>): Theme => {
  const colours = ansi.split(' ');
  return { term: { background, foreground, cursor, selectionBackground, ...Object.fromEntries(ANSI.map((name, i) => [name, colours[i]])) }, accent, accent2, ...flags };
};
const light = { light: true };
// How a playful theme treats the UI itself (see applyTheme); its art lives in components/ThemeDecor.tsx.
const sweet = { playful: true, icons: 'duotone', radius: '0.9rem' } as const; // soft, round, filled icons
const retro = { playful: true, icons: 'pixel', radius: '0', retro: true } as const; // square, monospace, blocky icons
const loud = { playful: true, icons: 'bold' } as const; // heavier strokes

export const DEFAULT_THEME = 'Spean Dark';

export const themes: Record<string, Theme> = {
  [DEFAULT_THEME]: { term: { background: '#0a0a0a', foreground: '#e5e5e5', cursor: '#38bdf8', selectionBackground: '#38bdf844' }, accent: '#38bdf8', accent2: '#2563eb' },
  'Solarized Dark': theme('#002b36', '#839496', '#93a1a1', '#073642', '#073642 #dc322f #859900 #b58900 #268bd2 #d33682 #2aa198 #eee8d5 #002b36 #cb4b16 #586e75 #657b83 #839496 #6c71c4 #93a1a1 #fdf6e3', '#2aa198', '#268bd2'),
  'Solarized Light': theme('#fdf6e3', '#657b83', '#586e75', '#eee8d5', '#073642 #dc322f #859900 #b58900 #268bd2 #d33682 #2aa198 #eee8d5 #002b36 #cb4b16 #586e75 #657b83 #839496 #6c71c4 #93a1a1 #fdf6e3', '#1b6fa8', '#1a7f78', light),
  'GitHub Light': theme('#ffffff', '#24292f', '#0969da', '#0969da33', '#24292f #cf222e #116329 #4d2d00 #0969da #8250df #1b7c83 #6e7781 #57606a #a40e26 #1a7f37 #633c01 #218bff #a475f9 #3192aa #8c959f', '#0969da', '#8250df', light),
  Dracula: theme('#282a36', '#f8f8f2', '#f8f8f2', '#44475a', '#21222c #ff5555 #50fa7b #f1fa8c #bd93f9 #ff79c6 #8be9fd #f8f8f2 #6272a4 #ff6e6e #69ff94 #ffffa5 #d6acff #ff92df #a4ffff #ffffff', '#bd93f9', '#ff79c6'),
  Nord: theme('#2e3440', '#d8dee9', '#d8dee9', '#434c5e', '#3b4252 #bf616a #a3be8c #ebcb8b #81a1c1 #b48ead #88c0d0 #e5e9f0 #4c566a #bf616a #a3be8c #ebcb8b #81a1c1 #b48ead #8fbcbb #eceff4', '#88c0d0', '#81a1c1'),
  'Gruvbox Dark': theme('#282828', '#ebdbb2', '#ebdbb2', '#504945', '#282828 #cc241d #98971a #d79921 #458588 #b16286 #689d6a #a89984 #928374 #fb4934 #b8bb26 #fabd2f #83a598 #d3869b #8ec07c #ebdbb2', '#fabd2f', '#fe8019'),
  'Tokyo Night': theme('#1a1b26', '#c0caf5', '#c0caf5', '#33467c', '#15161e #f7768e #9ece6a #e0af68 #7aa2f7 #bb9af7 #7dcfff #a9b1d6 #414868 #f7768e #9ece6a #e0af68 #7aa2f7 #bb9af7 #7dcfff #c0caf5', '#7aa2f7', '#bb9af7'),
  'One Dark': theme('#282c34', '#abb2bf', '#528bff', '#3e4451', '#282c34 #e06c75 #98c379 #e5c07b #61afef #c678dd #56b6c2 #abb2bf #5c6370 #e06c75 #98c379 #e5c07b #61afef #c678dd #56b6c2 #ffffff', '#61afef', '#c678dd'),
  Monokai: theme('#272822', '#f8f8f2', '#f8f8f0', '#49483e', '#272822 #f92672 #a6e22e #f4bf75 #66d9ef #ae81ff #a1efe4 #f8f8f2 #75715e #f92672 #a6e22e #f4bf75 #66d9ef #ae81ff #a1efe4 #f9f8f5', '#a6e22e', '#66d9ef'),
  'Rosé Pine': theme('#191724', '#e0def4', '#524f67', '#403d52', '#26233a #eb6f92 #31748f #f6c177 #9ccfd8 #c4a7e7 #ebbcba #e0def4 #6e6a86 #eb6f92 #31748f #f6c177 #9ccfd8 #c4a7e7 #ebbcba #e0def4', '#ebbcba', '#c4a7e7'),
  'Catppuccin Mocha': theme('#1e1e2e', '#cdd6f4', '#f5e0dc', '#585b70', '#45475a #f38ba8 #a6e3a1 #f9e2af #89b4fa #f5c2e7 #94e2d5 #bac2de #585b70 #f38ba8 #a6e3a1 #f9e2af #89b4fa #f5c2e7 #94e2d5 #a6adc8', '#cba6f7', '#f5c2e7'),
  'Catppuccin Latte': theme('#eff1f5', '#4c4f69', '#dc8a78', '#acb0be', '#5c5f77 #d20f39 #40a02b #df8e1d #1e66f5 #ea76cb #179299 #acb0be #6c6f85 #d20f39 #40a02b #df8e1d #1e66f5 #ea76cb #179299 #bcc0cc', '#8839ef', '#1e66f5', light),

  Bubblegum: theme('#2b1330', '#ffd6ec', '#ff7ac6', '#ff7ac655', '#3d1f45 #ff5c8a #7df9c4 #ffe066 #7ab8ff #ff7ac6 #6ff2f2 #ffe3f2 #9a6fa3 #ff86a8 #a3ffd9 #fff099 #a5d0ff #ffa3d9 #a0ffff #ffffff', '#ff7ac6', '#b388ff', sweet),
  'Cotton Candy': theme('#fff0f8', '#4a2b55', '#d6409f', '#d6409f33', '#4a2b55 #c81e5f #0b7a5c #8f5a00 #2a62c4 #a8279f #0a7a8a #8a6a96 #7a5a86 #cc2560 #0a7f60 #966000 #2f6ad0 #b42fab #087a89 #b79cc2', '#c22d8b', '#6f4fef', { ...sweet, ...light }),
  Synthwave: theme('#1a1033', '#f5e9ff', '#ff4dd8', '#ff4dd844', '#2a1a4d #ff3d81 #3dffb5 #ffe14d #4da6ff #ff4dd8 #2de2e6 #e8dcff #8573b3 #ff6b9d #7affcc #fff07f #80c0ff #ff85e4 #6ff0f2 #ffffff', '#ff4dd8', '#2de2e6', loud),
  Arcade: theme('#0b0b2b', '#f8f8ff', '#fff02e', '#fff02e33', '#1c1c4d #ff3b3b #2eff5c #fff02e #4d8dff #ff5cf4 #2ef6ff #e6e6ff #8080b8 #ff7070 #70ff8f #fff570 #80adff #ff8cf7 #70f9ff #ffffff', '#fff02e', '#ff3b3b', retro),
  Phosphor: theme('#041204', '#39ff6a', '#39ff6a', '#39ff6a33', '#0a2a0f #ff6b4a #39ff6a #d4ff3a #4dd2ff #c58bff #3affc8 #b8ffcb #3f8f55 #ff9478 #7aff9c #e6ff7a #85e0ff #dab5ff #7affdb #eafff0', '#39ff6a', '#13b843', retro),
  'Amber CRT': theme('#140c00', '#ffb000', '#ffb000', '#ffb00033', '#2b1c00 #ff5a36 #c7d900 #ffcc33 #66b3ff #ff8ac2 #5fd9c4 #ffdc8a #8f6a1f #ff8266 #dcec4d #ffdb70 #99ccff #ffb0d6 #8ce6d6 #fff0cc', '#ffb000', '#ff7a00', retro),
  Lava: theme('#1f0a06', '#ffe3d1', '#ff7a1f', '#ff5a1f44', '#3a1810 #ff5a36 #b5d94c #ffb01f #6fb3ff #ff7ab8 #5ed9c9 #ffd9c2 #a0705f #ff8266 #cfeb70 #ffcb66 #99ccff #ffa3d0 #8ce6d9 #fff1e8', '#ff5a1f', '#ffb01f', loud),
  'Deep Sea': theme('#04202e', '#c9f4ff', '#22d3ee', '#22d3ee33', '#0c3547 #ff7a85 #34d399 #fcd34d #60a5fa #c4a1ff #22d3ee #c9f4ff #5f93a8 #ffa0a8 #6ee7b7 #fde68a #93c5fd #d8c2ff #67e8f9 #f0fcff', '#22d3ee', '#34d399', sweet),
  Banana: theme('#fff9d6', '#4a3b00', '#c98a00', '#e0a80055', '#4a3b00 #c0281e #4a7a00 #8a6400 #1f5fbf #a0309a #007a7a #8f8550 #6f6220 #cc3025 #4d7f00 #8f6800 #2b70d6 #b83db0 #007f7f #bdb27a', '#8f6200', '#b84a0c', { ...sweet, ...light }),
  'Mint Chocolate': theme('#2a1c14', '#c9ffe5', '#5effb5', '#5effb533', '#3d2a1f #ff7f6b #5effb5 #f2cf7e #7ec8ff #e0a3ff #6ff0d8 #e6fff3 #a08672 #ff9f8f #8fffcb #f7dfa3 #a3d9ff #ebc2ff #99f5e3 #ffffff', '#5effb5', '#c58a5a', sweet),
  Watermelon: theme('#12261a', '#ffe0e0', '#ff4f6d', '#ff4f6d44', '#1f3b2a #ff5f7a #5fe08a #ffd166 #6fb8ff #ff8ad1 #5fd9d0 #ffe9e9 #7fa08c #ff8a9e #8aecab #ffe08f #99ccff #ffadde #8ae6df #ffffff', '#ff4f6d', '#3ecf6e', sweet),
  Spooky: theme('#16101e', '#f7e8d0', '#ff7a18', '#ff7a1844', '#2a2036 #ff5a4d #9ad94c #ff9a3d #7aa8ff #b98aff #5fd9c0 #e8dcc8 #8a7aa0 #ff8478 #bce87a #ffb870 #a3c4ff #d0b0ff #8ce6d3 #fff6e6', '#ff7a18', '#a259ff', loud),
};

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const CHROME_TOKENS = ['background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground', 'primary', 'primary-foreground', 'secondary', 'secondary-foreground', 'muted', 'muted-foreground', 'accent', 'accent-foreground', 'border', 'input', 'ring', 'sidebar', 'sidebar-foreground', 'sidebar-accent', 'sidebar-accent-foreground', 'sidebar-border', 'brand', 'brand-2', 'brand-fg', 'radius'];

/** Retints the app chrome from the theme's own colours. The default theme keeps the neutral tokens in index.css. */
export function applyTheme(name?: string) {
  const root = document.documentElement.style;
  CHROME_TOKENS.forEach((k) => root.removeProperty('--' + k));
  const t = name && name !== DEFAULT_THEME ? themes[name] : undefined;
  document.documentElement.classList.toggle('tinted', !!t);
  document.documentElement.dataset.icons = t?.icons ?? '';
  document.documentElement.toggleAttribute('data-retro', !!t?.retro);
  if (!t) return;
  const bg = t.term.background!;
  const termFg = t.term.foreground!;
  // Some terminal foregrounds are dim by design (Solarized); small app text needs more contrast than that.
  const fg = contrast(bg, termFg) < 8 ? `color-mix(in oklab, ${termFg}, ${t.light ? '#000' : '#fff'} 40%)` : termFg;
  const mix = (pct: number) => `color-mix(in oklab, ${bg}, ${fg} ${pct}%)`;
  const set = (value: string, ...tokens: string[]) => tokens.forEach((k) => root.setProperty('--' + k, value));
  set(bg, 'background', 'primary-foreground');
  set(fg, 'foreground', 'card-foreground', 'popover-foreground', 'primary', 'secondary-foreground', 'accent-foreground', 'sidebar-foreground', 'sidebar-accent-foreground');
  set(mix(5), 'sidebar');
  set(mix(8), 'card', 'popover');
  set(mix(15), 'secondary', 'muted', 'accent', 'sidebar-accent');
  set(mix(20), 'border', 'input', 'sidebar-border');
  set(mix(45), 'ring');
  set(mix(78), 'muted-foreground');
  if (t.radius) set(t.radius, 'radius');
  set(t.accent, 'brand');
  set(t.accent2, 'brand-2');
  // 0.18 is where black and white text have equal contrast
  set((luminance(t.accent) + luminance(t.accent2)) / 2 > 0.18 ? '#0a0a0a' : '#ffffff', 'brand-fg');
}

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
