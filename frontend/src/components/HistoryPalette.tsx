import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { History, Search } from 'lucide-react';
import { HistorySearch } from '../../wailsjs/go/main/App';
import type { main } from '../../wailsjs/go/models';

type Props = {
  open: boolean;
  host?: string; // active host; toggle to search everywhere
  onClose(): void;
  onPick(cmd: string, run: boolean): void; // Enter types + runs, ⇧Enter only types
};

const ago = (unix: number) => {
  const m = Math.round((Date.now() / 1000 - unix) / 60);
  return m < 1 ? 'now' : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};

/** ⌘R: every command you ran through Spean, on every host, newest first. */
export function HistoryPalette({ open, host, onClose, onPick }: Props) {
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const [rows, setRows] = useState<main.HistEntry[]>([]);
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setCursor(0);
    setAll(!host);
    setTimeout(() => input.current?.focus(), 50);
  }, [open, host]);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => HistorySearch(q, all ? '' : host ?? '', 60).then((r) => setRows(r ?? [])), 60);
    return () => clearTimeout(t);
  }, [q, all, host, open]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') setCursor((c) => Math.min(c + 1, rows.length - 1));
    else if (e.key === 'ArrowUp') setCursor((c) => Math.max(c - 1, 0));
    else if (e.key === 'Tab') setAll((v) => !v);
    else if (e.key === 'Enter' && rows[cursor]) {
      onPick(rows[cursor].cmd, !e.shiftKey);
      onClose();
    } else return;
    e.preventDefault();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-start bg-black/40 pt-[14vh]"
          onClick={onClose}
        >
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl overflow-hidden rounded-3xl bg-popover/95 ring-1 ring-white/10 backdrop-blur-xl">
            <div className="flex h-12 items-center gap-3 px-5">
              <Search className="size-4 text-muted-foreground" />
              <input
                ref={input}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setCursor(0);
                }}
                onKeyDown={onKey}
                placeholder={all ? 'Search commands on every host…' : `Search commands on ${host}…`}
                spellCheck={false}
                className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
              />
              <button type="button" onClick={() => setAll((v) => !v)} className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground" title="Tab toggles">
                {all ? 'all hosts' : host}
              </button>
            </div>
            <ul className="max-h-[50vh] overflow-y-auto border-t border-white/10 p-2 font-mono text-xs">
              {rows.map((r, i) => (
                <li
                  key={r.host + r.cmd}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => {
                    onPick(r.cmd, true);
                    onClose();
                  }}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-1.5 ${i === cursor ? 'bg-white/10' : ''}`}
                >
                  <History className={`size-3.5 shrink-0 ${r.exit ? 'text-red-400' : 'text-muted-foreground'}`} />
                  <span className="min-w-0 flex-1 truncate">{r.cmd}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {all ? r.host + ' · ' : ''}
                    {r.cwd ? r.cwd.replace(/^\/home\/[^/]+|^\/Users\/[^/]+/, '~') + ' · ' : ''}
                    {(r.n ?? 0) > 1 ? `×${r.n} · ` : ''}
                    {ago(r.at)}
                  </span>
                </li>
              ))}
              {!rows.length && <li className="px-3 py-2 text-muted-foreground">{q ? 'nothing matches' : 'no history yet — commands you run through Spean land here'}</li>}
            </ul>
            <div className="flex gap-3 border-t border-white/10 px-4 py-1.5 text-[10px] text-muted-foreground">
              <span>Enter runs</span>
              <span>⇧Enter types only</span>
              <span>Tab: this host / all</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
