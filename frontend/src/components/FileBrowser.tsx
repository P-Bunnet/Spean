import { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Pane, type Drag, type Source } from '@/components/Pane';
import { Transfer } from '../../wailsjs/go/main/App';
import { onDrop } from '@/lib/drops';

type Props = {
  tabs: Source[]; // connected terminal tabs
  active?: string; // active tab id, default source for the right pane
  run(tabId: string, text: string, enter?: boolean): boolean;
  onOpen(src: string, path: string): void;
  goto?: { sid: string; path: string; n: number }; // jump the right pane to a path on a tab (terminal selection)
};

// Two panes (Transmit layout). Local ↔ remote and remote ↔ remote all go through the transfer engine.
export function FileBrowser({ tabs, active, run, onOpen, goto }: Props) {
  const sources: Source[] = [{ id: 'local', label: 'Local' }, ...tabs];
  const [srcs, setSrcs] = useState<[string, string]>(['local', active ?? 'local']);
  const [side, setSide] = useState<0 | 1>(1); // which pane shows when there is room for only one
  const [wide, setWide] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  const clipboard = useRef<Drag | null>(null);
  useEffect(() => {
    if (goto) {
      setSrcs((s) => [s[0], goto.sid]);
      setSide(1);
    }
  }, [goto]);
  // two panes need ~40rem; below that, one pane with a swap button (⌘C / ⌘V still crosses sides)
  useEffect(() => {
    const el = root.current!;
    const ro = new ResizeObserver(() => setWide(el.clientWidth >= 640));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // a pane whose tab closed falls back to local
  const ids = new Set(sources.map((s) => s.id));
  const [left, right] = srcs.map((s) => (ids.has(s) ? s : 'local')) as [string, string];

  const start = (from: Drag, to: string, dir: string, move: boolean) => Transfer({ src: from.src, paths: from.paths }, { src: to, dir }, move);

  // Finder drops: the pane under the cursor, or the folder row under it, is the target.
  useEffect(
    () =>
      onDrop('pane', (paths, pane) => {
        const row = pane.querySelector<HTMLElement>('li[data-dir]:hover');
        start({ src: 'local', paths }, pane.dataset.pane!, row?.dataset.dir ?? pane.dataset.path!, false);
      }),
    [],
  );

  const panes = [left, right] as const;
  return (
    <div ref={root} className="relative flex min-h-0 min-w-0 flex-1 divide-x">
      {!wide && (
        <Button
          size="icon-xs"
          variant="ghost"
          className="absolute top-1.5 right-9 z-10"
          title={`Swap to ${side ? sources.find((s) => s.id === left)?.label ?? 'Local' : sources.find((s) => s.id === right)?.label ?? 'host'}`}
          onClick={() => setSide((v) => (v ? 0 : 1))}
        >
          <ArrowLeftRight />
        </Button>
      )}
      {panes.map((src, i) => (wide || i === side) && (
        <Pane
          key={i + src}
          src={src}
          sources={sources}
          onSrc={(id) => setSrcs((s) => (i === 0 ? [id, s[1]] : [s[0], id]))}
          run={src === 'local' ? undefined : (t, e) => run(src, t, e)}
          onDrop={(from, dir, move) => start(from, src, dir, move)}
          onOpen={(p) => onOpen(src, p)}
          jumpTo={goto && goto.sid === src && i === 1 ? goto : undefined}
          clipboard={clipboard}
        />
      ))}
    </div>
  );
}
