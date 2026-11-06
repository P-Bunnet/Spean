// Adapted from obsidianui.dev Apple Spotlight (MIT). Kept: spring blur-in, layout
// animations, staggered results. Replaced demo data with Spean hosts + keyboard nav.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, Search, Server, Star } from 'lucide-react';
import type { config } from '../../../wailsjs/go/models';

export type Extra = { id: string; title: string; sub: string; section?: string; run(): void };
type Row = { kind: 'host'; h: config.Entry; section: string } | { kind: 'extra'; x: Extra; section: string };

type Props = {
  open: boolean;
  hosts: config.Entry[];
  extras?: Extra[]; // favorites of the active host, actions
  onClose(): void;
  onPick(alias: string): void;
};

export function Spotlight({ open, hosts, extras = [], onClose, onPick }: Props) {
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const results = useMemo<Row[]>(() => {
    const s = q.trim().toLowerCase();
    const hs = s ? hosts.filter((h) => [h.alias, h.group ?? '', ...(h.tags ?? [])].some((v) => v.toLowerCase().includes(s))) : hosts;
    const xs = s ? extras.filter((x) => x.title.toLowerCase().includes(s)) : extras;
    const recent = s ? [] : [...hosts].filter((h) => h.lastConnect).sort((a, b) => b.lastConnect! - a.lastConnect!).slice(0, 4);
    const rows: Row[] = [
      ...recent.map((h): Row => ({ kind: 'host', h, section: 'Recent' })),
      ...xs.map((x): Row => ({ kind: 'extra', x, section: x.section ?? 'Actions' })),
      ...hs.filter((h) => !recent.includes(h)).map((h): Row => ({ kind: 'host', h, section: 'Hosts' })),
    ];
    return rows.slice(0, 16);
  }, [q, hosts, extras]);

  useEffect(() => {
    if (open) {
      setQ('');
      setCursor(0);
      setTimeout(() => input.current?.focus(), 50);
    }
  }, [open]);

  function pick(r: Row | undefined) {
    if (!r) {
      const alias = q.trim(); // no match → literal user@host
      if (alias) onPick(alias);
    } else if (r.kind === 'host') onPick(r.h.alias);
    else r.x.run();
    onClose();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') setCursor((c) => Math.min(c + 1, results.length - 1));
    else if (e.key === 'ArrowUp') setCursor((c) => Math.max(c - 1, 0));
    else if (e.key === 'Enter') pick(results[cursor]);
    else return;
    e.preventDefault();
  }

  return (
    <AnimatePresence mode="wait">
      {open && (
        <motion.div
          initial={{ opacity: 0, filter: 'blur(20px)', scaleX: 1.3, scaleY: 1.1, y: -10 }}
          animate={{ opacity: 1, filter: 'blur(0px)', scaleX: 1, scaleY: 1, y: 0 }}
          exit={{ opacity: 0, filter: 'blur(20px)', scaleX: 1.3, scaleY: 1.1, y: 10 }}
          transition={{ stiffness: 550, damping: 50, type: 'spring' }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-start bg-black/40 pt-[18vh]"
          onClick={onClose}
        >
          <motion.div
            layout
            onClick={(e) => e.stopPropagation()}
            transition={{ layout: { duration: 0.4, type: 'spring', bounce: 0.15 } }}
            style={{ borderRadius: 24 }}
            className="w-full max-w-xl overflow-hidden border border-white/10 bg-neutral-900/95 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex h-14 items-center gap-3 px-5">
              <Search className="size-5 text-neutral-400" />
              <input
                ref={input}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setCursor(0);
                }}
                onKeyDown={onKey}
                placeholder="Connect to… (alias, tag, or user@host)"
                spellCheck={false}
                className="flex-1 bg-transparent text-lg text-neutral-100 outline-none placeholder:text-neutral-500"
              />
              <kbd className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-neutral-500">esc</kbd>
            </div>
            {results.length > 0 && (
              <motion.div layout className="max-h-80 overflow-y-auto border-t border-white/10 p-2">
                {results.map((r, i) => (
                  <motion.div
                    key={(r.kind === 'host' ? r.h.alias : 'x' + r.x.id) + r.section}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.15 }}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => pick(r)}
                    data-section={i === 0 || results[i - 1].section !== r.section ? r.section : undefined}
                    className={`group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 data-[section]:mt-2 data-[section]:before:block data-[section]:before:w-full data-[section]:before:text-[10px] data-[section]:before:uppercase data-[section]:before:tracking-wider data-[section]:before:text-neutral-500 data-[section]:before:content-[attr(data-section)] data-[section]:flex-wrap ${
                      i === cursor ? 'bg-white/10' : ''
                    }`}
                  >
                    {r.kind === 'host' ? <Server className="size-5 stroke-[1.5] text-sky-400" /> : <Star className="size-5 stroke-[1.5] text-amber-400" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-neutral-100">{r.kind === 'host' ? r.h.alias : r.x.title}</p>
                      <p className="truncate text-xs text-neutral-500">
                        {r.kind === 'host'
                          ? [r.h.group, ...(r.h.tags ?? [])].filter(Boolean).join(' · ') || (r.h.saved ? 'saved host' : '~/.ssh/config')
                          : r.x.sub}
                      </p>
                    </div>
                    <ChevronRight className={`size-4 text-neutral-500 ${i === cursor ? 'opacity-100' : 'opacity-0'}`} />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
