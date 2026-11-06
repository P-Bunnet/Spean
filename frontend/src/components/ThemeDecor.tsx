import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Anchor, Banana, Binary, Cake, Candy, CandyCane, Cat, Cherry, Citrus, Cloud, Coins, Cookie, Cpu, Disc3, Droplet, Fish, Flame, FlameKindling, Gamepad2, Ghost, Heart, IceCreamCone, Joystick, Leaf, Lollipop, Moon, Mountain, Music, Palmtree, Popsicle, Radio, Shell, Skull, Sparkles, Sprout, Star, Sun, Sunset, Swords, Terminal, Trophy, Tv, Waves, Zap,
} from 'lucide-react';
import { themes } from '@/lib/settings';

type Decor = {
  emoji: string; // shown in the theme picker, where a native <option> cannot hold an SVG
  mascot: LucideIcon; // on tabs, the empty screen and the corner of the terminal
  scatter: LucideIcon[];
  scene?: 'sunset' | 'crt' | 'stars' | 'bubbles' | 'embers' | 'moon'; // CSS backdrop in index.css
  glow?: boolean; // terminal text glows
  scanlines?: boolean; // CRT lines over the terminal
};

const decor: Record<string, Decor> = {
  Bubblegum: { emoji: '🍬', mascot: Candy, scatter: [Candy, Heart, Star, CandyCane, Sparkles] },
  'Cotton Candy': { emoji: '🍭', mascot: Lollipop, scatter: [Cloud, Lollipop, Heart, IceCreamCone, Sparkles, Cake] },
  Synthwave: { emoji: '🌆', mascot: Sunset, scatter: [Music, Disc3, Star, Zap], scene: 'sunset', glow: true },
  Arcade: { emoji: '🕹️', mascot: Gamepad2, scatter: [Gamepad2, Star, Trophy, Coins, Joystick, Swords], scene: 'stars' },
  Phosphor: { emoji: '📟', mascot: Terminal, scatter: [Binary, Cpu, Terminal], scene: 'crt', glow: true, scanlines: true },
  'Amber CRT': { emoji: '📺', mascot: Tv, scatter: [Tv, Radio, Cpu], scene: 'crt', glow: true, scanlines: true },
  Lava: { emoji: '🌋', mascot: Flame, scatter: [Flame, FlameKindling, Mountain, Zap], scene: 'embers' },
  'Deep Sea': { emoji: '🐙', mascot: Fish, scatter: [Fish, Anchor, Shell, Waves], scene: 'bubbles' },
  Banana: { emoji: '🍌', mascot: Banana, scatter: [Banana, Sun, Palmtree, Citrus] },
  'Mint Chocolate': { emoji: '🍫', mascot: Cookie, scatter: [Cookie, Leaf, Sprout, IceCreamCone, Popsicle] },
  Watermelon: { emoji: '🍉', mascot: Citrus, scatter: [Citrus, Droplet, Cherry, Sun] },
  Spooky: { emoji: '👻', mascot: Ghost, scatter: [Ghost, Skull, Cat, Moon, Sparkles], scene: 'moon' },
};

export const decorFor = (theme?: string): Decor | undefined => (theme ? decor[theme] : undefined);

// left %, top %, size px, rotation: fixed, so the art does not jump between renders
const SPOTS = [
  [6, 8, 26, -18], [24, 22, 18, 12], [44, 6, 22, 24], [68, 14, 30, -10], [88, 6, 20, 16],
  [12, 42, 22, 20], [36, 52, 28, -24], [62, 44, 18, 8], [84, 36, 26, -14],
  [4, 74, 30, 10], [28, 84, 20, -8], [52, 76, 24, 18], [74, 88, 18, -20], [92, 66, 22, 12],
];

/**
 * Backdrop for a playful theme: scene, scattered icons and a large mascot. Nothing for other themes.
 * The parent needs `relative isolate` so the layer sits above its background and below its content.
 */
export function ThemeDecor({ theme, where }: { theme?: string; where: 'term' | 'side' | 'empty' }) {
  const d = decorFor(theme);
  if (!d) return null;
  const { accent, accent2 } = themes[theme!];
  return (
    <div aria-hidden className={`theme-decor in-${where} ${d.scene ? 'scene-' + d.scene : 'scene-soft'}`} style={{ '--d1': accent, '--d2': accent2 } as CSSProperties}>
      {SPOTS.map(([x, y, size, rotate], i) => {
        const Icon = d.scatter[i % d.scatter.length];
        return <Icon key={i} style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, rotate: `${rotate}deg` }} />;
      })}
      <d.mascot className="theme-decor-mascot" />
    </div>
  );
}
