import { DottedGrid } from '@/components/block/dotted-grid';
import { MOD } from '@/lib/keys';
import { Button } from '@/components/ui/button';
import logo from '@/assets/logo.svg';
import { DEFAULT_THEME, useSettings } from '@/lib/settings';
import { ThemeDecor, decorFor } from '@/components/ThemeDecor';

type Props = { onConnect(): void; onAddHost(): void; onLocal?(): void };

/** No tabs open. Dots follow the mouse; the actions are the next step, not decoration. */
export function EmptyState({ onConnect, onAddHost, onLocal }: Props) {
  const theme = useSettings()?.theme;
  const Mascot = decorFor(theme)?.mascot;
  return (
    <div className="absolute inset-0">
      {/* The grid paints its own black backdrop, so it only suits the default theme. */}
      {!theme || theme === DEFAULT_THEME ? <DottedGrid className="h-full cursor-default" shapes={false} /> : <div className="h-full bg-background" />}
      <ThemeDecor theme={theme} where="empty" />
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-5">
        <div className="pointer-events-auto flex flex-col items-center gap-2 rounded-3xl bg-background/70 px-10 py-8 ring-1 ring-white/10 backdrop-blur-md">
          {Mascot ? <Mascot className="size-14 text-brand" /> : <img src={logo} alt="" className="size-14 rounded-2xl" draggable={false} />}
          <p className="text-2xl leading-none">ស្ពាន</p>
          <p className="text-[11px] tracking-[0.3em] text-muted-foreground uppercase">Spean</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" className="brand-grad text-brand-fg" onClick={onConnect}>
              Connect <kbd className="ml-1 rounded bg-black/20 px-1 text-[10px]">{MOD}K</kbd>
            </Button>
            <Button size="sm" variant="outline" onClick={onAddHost}>
              Add host
            </Button>
            {onLocal && (
              <Button size="sm" variant="ghost" onClick={onLocal}>
                Local terminal
              </Button>
            )}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            <kbd className="rounded border border-white/15 px-1">{MOD}⇧F</kbd> files · <kbd className="rounded border border-white/15 px-1">{MOD}⇧D</kbd> docker ·{' '}
            <kbd className="rounded border border-white/15 px-1">{MOD}B</kbd> sidebar · <kbd className="rounded border border-white/15 px-1">{MOD},</kbd> settings
          </p>
        </div>
      </div>
    </div>
  );
}
