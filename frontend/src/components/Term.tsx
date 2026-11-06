import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { ClipboardAddon } from '@xterm/addon-clipboard';
import '@xterm/xterm/css/xterm.css';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Resize, Write } from '../../wailsjs/go/main/App';
import { BrowserOpenURL, ClipboardSetText, EventsOn } from '../../wailsjs/runtime/runtime';
import { themes, useSettings } from '@/lib/settings';

export type TermHandle = {
  write(s: string): void;
  reset(): void;
  focus(): void;
  fit(): void;
  size(): { cols: number; rows: number };
  /** Types text (+ Enter) into the shell; false only when the tab is closed. No prompt detection: that
   * needs a hook installed in the remote shell, which would leave traces in the server's history. */
  run(text: string, enter?: boolean): boolean;
  search(open: boolean): void;
  pause(p: boolean): void; // log tabs: stop rendering, keep the stream; resume flushes
  clear(): void;
};

type Props = {
  id: string; // tab id; backend events are term:data:<id>
  hidden: boolean;
  onEnterWhenClosed(): void; // Enter on a dead tab = reconnect
  closed: boolean;
  onPaste?(text: string): Promise<boolean>; // multi-line paste guard; resolve false to drop it
  onInput?(data: string): void; // every keystroke after it went to this shell (broadcast)
  onSelectionMenu?(selection: string, x: number, y: number): void; // right-click with text selected
  onActivity?(kind: 'output' | 'bell'): void; // output or BEL arrived while this pane was hidden
  themeName?: string; // per-host preset override
};

export const Term = forwardRef<TermHandle, Props>(function Term({ id, hidden, closed, onEnterWhenClosed, onPaste, onInput, onSelectionMenu, onActivity, themeName }, ref) {
  const el = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal>(null);
  const fitRef = useRef<FitAddon>(null);
  const searchRef = useRef<SearchAddon>(null);
  const closedRef = useRef(closed);
  closedRef.current = closed;
  const reconnect = useRef(onEnterWhenClosed);
  reconnect.current = onEnterWhenClosed;
  const pasteCb = useRef(onPaste);
  pasteCb.current = onPaste;
  const inputCb = useRef(onInput);
  inputCb.current = onInput;
  const selCb = useRef(onSelectionMenu);
  selCb.current = onSelectionMenu;
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;
  const actCb = useRef(onActivity);
  actCb.current = onActivity;
  const lastAct = useRef(0);
  const bellRef = useRef(true);
  const copyOnSelect = useRef(false);
  const paused = useRef(false);
  const backlog = useRef<Uint8Array[]>([]);
  const [find, setFind] = useState<string | null>(null);
  const settings = useSettings();

  useEffect(() => {
    const t = new Terminal({ fontSize: 13, fontFamily: 'Menlo, monospace', theme: themes['Spean Dark'].term, allowProposedApi: true });
    const fit = new FitAddon();
    const search = new SearchAddon();
    t.loadAddon(fit);
    t.loadAddon(search);
    t.loadAddon(new WebLinksAddon((_e, uri) => BrowserOpenURL(uri)));
    t.loadAddon(new Unicode11Addon());
    t.loadAddon(new ClipboardAddon()); // OSC 52: remote copy lands in the local clipboard
    t.unicode.activeVersion = '11';
    t.open(el.current!);
    fit.fit();
    term.current = t;
    fitRef.current = fit;
    searchRef.current = search;

    const d1 = t.onData((d) => {
      if (closedRef.current) {
        if (d === '\r') reconnect.current();
        return;
      }
      Write(id, d);
      inputCb.current?.(d);
    });
    const d3 = t.onBell(() => {
      if (bellRef.current) el.current?.animate([{ opacity: 1 }, { opacity: 0.4 }, { opacity: 1 }], { duration: 150 });
      if (hiddenRef.current) actCb.current?.('bell');
    });
    // multi-line paste guard: intercept before xterm's own paste handler
    const host = el.current!;
    const onPasteEv = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text') ?? '';
      if (!text.includes('\n') || !pasteCb.current) return;
      e.preventDefault();
      e.stopPropagation();
      pasteCb.current(text).then((ok) => ok && t.paste(text));
    };
    host.addEventListener('paste', onPasteEv, true);
    const onCtx = (e: MouseEvent) => {
      const sel = t.getSelection();
      if (sel && selCb.current) {
        e.preventDefault();
        selCb.current(sel, e.clientX, e.clientY);
      }
    };
    host.addEventListener('contextmenu', onCtx);
    const d4 = t.onSelectionChange(() => {
      const sel = t.getSelection();
      if (sel && copyOnSelect.current) ClipboardSetText(sel);
    });
    const d2 = t.onResize(({ cols, rows }) => Resize(id, cols, rows));
    // Refit whenever our box changes (right pane opens, split divider drags, window resize).
    // Without this the canvas keeps its old width and overflows onto neighbours, eating their clicks.
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => host.clientWidth > 0 && fit.fit());
    });
    ro.observe(host);
    const offData = EventsOn('term:data:' + id, (b64: string) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      if (hiddenRef.current && Date.now() - lastAct.current > 500) {
        lastAct.current = Date.now();
        actCb.current?.('output');
      }
      if (paused.current) backlog.current.push(bytes); // ponytail: unbounded while paused; cap if someone pauses a firehose for an hour
      else t.write(bytes);
    });
    return () => {
      d1.dispose();
      d2.dispose();
      d3.dispose();
      host.removeEventListener('paste', onPasteEv, true);
      host.removeEventListener('contextmenu', onCtx);
      d4.dispose();
      ro.disconnect();
      cancelAnimationFrame(raf);
      offData();
      t.dispose();
    };
  }, [id]);

  // settings apply live
  useEffect(() => {
    const t = term.current;
    if (!t || !settings) return;
    bellRef.current = settings.bell;
    copyOnSelect.current = settings.copyOnSelect;
    t.options.fontFamily = settings.fontFamily;
    t.options.fontSize = settings.fontSize;
    t.options.scrollback = settings.scrollback;
    t.options.cursorStyle = settings.cursorStyle as 'block' | 'underline' | 'bar';
    t.options.cursorBlink = settings.cursorBlink;
    t.options.theme = (themes[themeName ?? ''] ?? themes[settings.theme] ?? themes['Spean Dark']).term;
    fitRef.current?.fit();
  }, [settings, themeName]);

  // refit when this tab becomes visible; xterm cannot measure a display:none box
  useEffect(() => {
    if (!hidden) {
      fitRef.current?.fit();
      term.current?.focus();
    }
  }, [hidden]);

  useImperativeHandle(ref, () => ({
    write: (s) => term.current?.write(s),
    reset: () => term.current?.reset(),
    focus: () => term.current?.focus(),
    fit: () => fitRef.current?.fit(),
    size: () => ({ cols: term.current?.cols ?? 80, rows: term.current?.rows ?? 24 }),
    run: (text, enter = true) => {
      if (closedRef.current) return false;
      Write(id, enter ? text + '\r' : text);
      return true;
    },
    pause: (p) => {
      paused.current = p;
      if (!p) {
        backlog.current.splice(0).forEach((b) => term.current?.write(b));
      }
    },
    clear: () => {
      backlog.current = [];
      term.current?.clear();
    },
    search: (open) => {
      setFind(open ? '' : null);
      if (!open) {
        searchRef.current?.clearDecorations();
        term.current?.focus();
      }
    },
  }));

  const bg = (themes[themeName ?? '']?.term.background ?? (settings && themes[settings.theme]?.term.background)) ?? '#0a0a0a';
  const opts = { decorations: { matchOverviewRuler: '#38bdf8', activeMatchColorOverviewRuler: '#38bdf8' } };
  return (
    <div className={`relative min-h-0 flex-1 ${hidden ? 'hidden' : 'flex flex-col'}`} style={{ background: bg }}>
      {find !== null && (
        <div className="absolute top-1 right-3 z-10 flex items-center gap-1 rounded-lg bg-popover p-1 ring-1 ring-foreground/10">
          <Input
            autoFocus
            value={find}
            placeholder="Find"
            onChange={(e) => {
              setFind(e.target.value);
              searchRef.current?.findNext(e.target.value, { incremental: true, ...opts });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setFind(null);
              else if (e.key === 'Enter' && e.shiftKey) searchRef.current?.findPrevious(find, opts);
              else if (e.key === 'Enter') searchRef.current?.findNext(find, opts);
            }}
            className="h-6 w-48 text-xs"
          />
          <Button size="icon-xs" variant="ghost" onClick={() => searchRef.current?.findPrevious(find, opts)}>
            <ChevronUp />
          </Button>
          <Button size="icon-xs" variant="ghost" onClick={() => searchRef.current?.findNext(find, opts)}>
            <ChevronDown />
          </Button>
          <Button size="icon-xs" variant="ghost" onClick={() => setFind(null)}>
            <X />
          </Button>
        </div>
      )}
      {/* Padding goes on .xterm: FitAddon subtracts that, but not padding on its parent, so the last row clips.
          The viewport is black by default and would paint over the padding, so let the theme background show. */}
      <div ref={el} className="min-h-0 flex-1 overflow-hidden [&_.xterm]:h-full [&_.xterm]:p-1 [&_.xterm-viewport]:bg-transparent!" />
    </div>
  );
});
