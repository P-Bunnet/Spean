import { useEffect, useRef, useState } from 'react';
import { MOD } from '@/lib/keys';
import { History, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DRAG_MIME, type Drag } from '@/components/Pane';
import type { TermHandle } from '@/components/Term';
import { packs, type Fav } from '@/packs';
import { onDrop } from '@/lib/drops';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { HistoryAdd, Mkdir, ReadHistory, StepRun, StepStart, StepStop, Transfer } from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';

const q = (p: string) => `'${p.replace(/'/g, `'\\''`)}'`;
const holes = (cmd: string) => [...new Set([...cmd.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))].filter((n) => n !== 'dropped');
const remembered: Record<string, Record<string, string>> = {}; // alias → placeholder → last value (session only)

type Props = {
  alias: string;
  tabId: string;
  term: TermHandle | null;
  favorites: Fav[];
  onChange(favs: Fav[]): void;
  starSignal: number; // ⌘⇧S from App bumps this
  starText?: string; // prefill (terminal selection)
  hotkey: number; // ⌘1-9 from App: index+1, then reset to 0
  snippets: Fav[]; // global; a host favorite with the same name shadows
  onSnippets(s: Fav[]): void;
  onMany(cmd: string): void; // run on many hosts…
};

/** Chip strip between the tab bar and the terminal: one click types the command. */
export function FavoriteBar({ alias, tabId, term, favorites: hostFavs, onChange, starSignal, starText, hotkey, snippets, onSnippets, onMany }: Props) {
  const favorites = [...hostFavs, ...snippets.filter((s) => !hostFavs.some((f) => f.name === s.name))];
  const [ask, setAsk] = useState<{ names: string[]; values: Record<string, string>; resolve(v: Record<string, string> | null): void } | null>(null);
  const [star, setStar] = useState<Fav | null>(null);
  const [hist, setHist] = useState<string[] | null>(null);
  const [histQ, setHistQ] = useState('');
  const [editing, setEditing] = useState(false);
  const [shake, setShake] = useState<number | null>(null);
  const [busy, setBusy] = useState('');
  const barRef = useRef<HTMLDivElement>(null);
  const [out, setOut] = useState<{ name: string; cmd: string; text: string; exit?: number; err?: string } | null>(null);
  const outRun = useRef(''); // open step shell; closing the output dialog stops it
  const outGen = useRef(0); // bumped on close, so a shell still starting does not run the command

  useEffect(() => {
    if (starSignal) setStar({ name: '', cmd: starText ?? '', run: true, exec: true });
  }, [starSignal]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (hotkey && favorites[hotkey - 1]) fire(favorites[hotkey - 1], hotkey - 1);
  }, [hotkey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Finder drop on a chip that has {{dropped}}
  useEffect(
    () =>
      onDrop('fav:' + tabId, (paths, el) => {
        const i = Number(el.dataset.fav);
        if (favorites[i]) dropped({ src: 'local', paths }, favorites[i], i);
      }),
    [tabId, favorites], // eslint-disable-line react-hooks/exhaustive-deps
  );

  function nope(i: number) {
    setShake(i);
    setTimeout(() => setShake(null), 400);
  }

  async function fire(f: Fav, i: number, droppedPath?: string) {
    let cmd = f.cmd;
    if (droppedPath) cmd = cmd.replaceAll('{{dropped}}', q(droppedPath));
    const names = holes(cmd);
    if (names.length) {
      const prev = remembered[alias] ?? {};
      const values = await new Promise<Record<string, string> | null>((resolve) =>
        setAsk({ names, values: Object.fromEntries(names.map((n) => [n, prev[n] ?? ''])), resolve }),
      );
      setAsk(null);
      if (!values) return;
      remembered[alias] = { ...prev, ...values };
      for (const n of names) cmd = cmd.replaceAll(`{{${n}}}`, values[n]);
    }
    if (f.exec && f.run) return quiet(f.name, cmd);
    if (!term?.run(cmd, f.run)) nope(i);
  }

  // Outside the shell, so nothing lands in its history. Output goes to a dialog instead of the terminal.
  async function quiet(name: string, cmd: string) {
    setOut({ name, cmd, text: '' });
    let off = () => {};
    let run = '';
    const gen = outGen.current;
    try {
      run = await StepStart(tabId);
      if (gen !== outGen.current) return StepStop(run);
      outRun.current = run;
      off = EventsOn('step:' + run, (l: string) => setOut((o) => o && { ...o, text: (o.text + l).slice(-1 << 20) }));
      const r = await StepRun(run, cmd);
      setOut((o) => o && { ...o, text: r.stdout, exit: r.exit });
      HistoryAdd(alias, '', cmd, r.exit);
    } catch (e) {
      setOut((o) => o && { ...o, err: String(e) });
    }
    off();
    if (run) StepStop(run);
    if (outRun.current === run) outRun.current = '';
  }
  function closeOut() {
    outGen.current++;
    if (outRun.current) StepStop(outRun.current);
    setOut(null);
  }

  // Drop-to-run: put the file on the host (unless it is already there), substitute, run; the typed line removes the upload after.
  async function dropped(from: Drag, f: Fav, i: number) {
    if (!f.cmd.includes('{{dropped}}')) return nope(i);
    const p = from.paths[0];
    if (from.src === tabId) return fire(f, i, p);
    const dir = `/tmp/spean-${Math.random().toString(36).slice(2, 8)}`;
    const remote = `${dir}/${p.split('/').pop()}`;
    setBusy('uploading…');
    try {
      await Mkdir(tabId, dir);
      const jobId = await Transfer({ src: from.src, paths: [p] }, { src: tabId, dir }, false);
      await new Promise<void>((resolve, reject) => {
        const off = EventsOn('transfer:update', (j: { id: string; status: string; err?: string }) => {
          if (j.id !== jobId || j.status === 'running' || j.status === 'queued') return;
          off();
          if (j.status === 'done') resolve();
          else reject(new Error(j.err || j.status));
        });
      });
    } catch (e) {
      setBusy(String(e));
      return;
    }
    setBusy('');
    fire({ ...f, cmd: `${f.cmd}; rm -r ${dir}` }, i, remote);
  }

  async function openHistory() {
    setBusy('reading history…');
    try {
      setHist((await ReadHistory(tabId)) ?? []);
      setHistQ('');
    } catch (e) {
      setBusy(String(e));
      return;
    }
    setBusy('');
  }

  const histRows = hist?.filter((h) => h.toLowerCase().includes(histQ.toLowerCase())).slice(0, 200) ?? [];

  return (
    <div ref={barRef} className="flex h-8 items-center gap-1 overflow-x-auto border-b px-2 text-xs">
      {favorites.map((f, i) => (
        <ContextMenu key={i}>
          <ContextMenuTrigger render={<span className="contents" />}>
        <button
          type="button"
          data-drop={'fav:' + tabId}
          data-fav={i}
          title={`${f.cmd}${i < 9 ? `  (${MOD}${i + 1})` : ''}${f.cmd.includes('{{dropped}}') ? '\ndrop a file here' : ''}`}
          onClick={() => fire(f, i)}
          onDragOver={(e) => f.cmd.includes('{{dropped}}') && e.dataTransfer.types.includes(DRAG_MIME) && e.preventDefault()}
          onDrop={(e) => {
            const raw = e.dataTransfer.getData(DRAG_MIME);
            if (raw) {
              e.preventDefault();
              dropped(JSON.parse(raw), f, i);
            }
          }}
          className={`shrink-0 rounded-md px-2 py-0.5 hover:bg-accent ${i < hostFavs.length ? 'bg-muted' : 'bg-muted/40 text-muted-foreground'} ${shake === i ? 'animate-[shake_0.4s]' : ''} ${
            f.cmd.includes('{{dropped}}') ? 'border border-dashed border-muted-foreground/40' : ''
          }`}
        >
          {f.name}
        </button>
          </ContextMenuTrigger>
          <ContextMenuContent className="text-xs">
            <ContextMenuItem onClick={() => fire(f, i)}>Run here</ContextMenuItem>
            <ContextMenuItem onClick={() => onMany(f.cmd)}>Run on many hosts…</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ))}
      {!favorites.length && <span className="text-muted-foreground">★ add a command, or import from history</span>}
      <span className="ml-auto shrink-0 truncate text-muted-foreground">{busy}</span>
      <Button size="icon-xs" variant="ghost" title={`Add a favorite (${MOD}⇧S)`} onClick={() => setStar({ name: '', cmd: '', run: true, exec: true })}>
        <Star />
      </Button>
      <Button size="icon-xs" variant="ghost" title="Import from shell history" onClick={openHistory}>
        <History />
      </Button>
      <Button size="icon-xs" variant="ghost" title="Edit favorites and packs" onClick={() => setEditing(true)}>
        <Pencil />
      </Button>

      {/* output of a command run outside the shell */}
      <Dialog open={!!out} onOpenChange={(o) => !o && closeOut()}>
        <DialogContent className="sm:max-w-2xl">
          {out && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {out.name} on {alias}
                </DialogTitle>
                <DialogDescription className="font-mono text-xs break-all">{out.cmd}</DialogDescription>
              </DialogHeader>
              <pre className="max-h-96 min-h-16 overflow-auto rounded-md bg-muted/40 p-2 font-mono text-xs whitespace-pre-wrap">{out.text.trimEnd()}</pre>
              <DialogFooter className="items-center">
                <span className={`mr-auto text-xs ${out.err || out.exit ? 'text-destructive' : out.exit === 0 ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                  {out.err ?? (out.exit === undefined ? 'running…' : `exit ${out.exit}`)}
                </span>
                <Button variant="outline" onClick={closeOut}>
                  {out.exit === undefined && !out.err ? 'Stop' : 'Close'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* placeholders */}
      <Dialog open={!!ask} onOpenChange={(o) => !o && ask?.resolve(null)}>
        <DialogContent className="sm:max-w-sm">
          {ask && (
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                ask.resolve(ask.values);
              }}
            >
              <DialogHeader>
                <DialogTitle>Fill in</DialogTitle>
              </DialogHeader>
              {ask.names.map((n, i) => (
                <Label key={n} className="grid gap-1">
                  <span className="font-mono text-xs text-muted-foreground">{`{{${n}}}`}</span>
                  <Input autoFocus={i === 0} value={ask.values[n]} onChange={(e) => setAsk({ ...ask, values: { ...ask.values, [n]: e.target.value } })} spellCheck={false} />
                </Label>
              ))}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => ask.resolve(null)}>
                  Cancel
                </Button>
                <Button type="submit">Run</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* star */}
      <Dialog open={!!star} onOpenChange={(o) => !o && setStar(null)}>
        <DialogContent className="sm:max-w-md">
          {star && (
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!star.name.trim() || !star.cmd.trim()) return;
                onChange([...hostFavs, { ...star, name: star.name.trim() }]);
                setStar(null);
              }}
            >
              <DialogHeader>
                <DialogTitle>Favorite command on {alias}</DialogTitle>
              </DialogHeader>
              <Input autoFocus placeholder="Name (chip label)" value={star.name} onChange={(e) => setStar({ ...star, name: e.target.value })} />
              <Input placeholder="Command — {{name}} prompts for a value" value={star.cmd} onChange={(e) => setStar({ ...star, cmd: e.target.value })} className="font-mono" spellCheck={false} />
              <Label className="flex items-center gap-2">
                <Checkbox checked={star.run} onCheckedChange={(c) => setStar({ ...star, run: !!c })} />
                Run on click (otherwise leave on the prompt to edit)
              </Label>
              <Label className="flex items-center gap-2">
                <Checkbox disabled={!star.run} checked={star.run && !!star.exec} onCheckedChange={(c) => setStar({ ...star, exec: !!c })} />
                Keep out of shell history (output opens in a window; no sudo prompts or full-screen programs)
              </Label>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setStar(null)}>
                  Cancel
                </Button>
                <Button type="submit">Save</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* history import */}
      <Dialog open={!!hist} onOpenChange={(o) => !o && setHist(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Shell history on {alias}</DialogTitle>
          </DialogHeader>
          <Input autoFocus placeholder="Search" value={histQ} onChange={(e) => setHistQ(e.target.value)} />
          <ul className="max-h-80 overflow-y-auto font-mono text-xs">
            {histRows.map((h) => (
              <li key={h} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-accent">
                <span className="flex-1 truncate" title={h}>
                  {h}
                </span>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  title="Star"
                  onClick={() => {
                    setHist(null);
                    setStar({ name: h.split(' ').slice(0, 2).join(' '), cmd: h, run: true, exec: true });
                  }}
                >
                  <Star />
                </Button>
              </li>
            ))}
            {hist && !histRows.length && <li className="px-2 py-1 text-muted-foreground">nothing found</li>}
          </ul>
        </DialogContent>
      </Dialog>

      {/* editor + packs */}
      <Dialog open={editing} onOpenChange={(o) => !o && setEditing(false)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Favorites on {alias}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap gap-3 text-xs">
            {Object.entries(packs).map(([name, list]) => {
              const on = list.every((p) => hostFavs.some((f) => f.cmd === p.cmd));
              return (
                <Label key={name} className="flex items-center gap-1.5">
                  <Checkbox
                    checked={on}
                    onCheckedChange={(c) =>
                      onChange(c ? [...hostFavs, ...list.filter((p) => !hostFavs.some((f) => f.cmd === p.cmd))] : hostFavs.filter((f) => !list.some((p) => p.cmd === f.cmd)))
                    }
                  />
                  {name} pack
                </Label>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">Checkboxes: run on click · keep out of shell history (output opens in a window; no sudo prompts or full-screen programs).</p>
          <ul className="grid gap-1">
            {hostFavs.map((f, i) => (
              <li key={i} className="grid grid-cols-[8rem_1fr_auto_auto_auto] items-center gap-1">
                <Input value={f.name} onChange={(e) => onChange(hostFavs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="h-7 text-xs" />
                <Input
                  value={f.cmd}
                  onChange={(e) => onChange(hostFavs.map((x, j) => (j === i ? { ...x, cmd: e.target.value } : x)))}
                  className="h-7 font-mono text-xs"
                  spellCheck={false}
                />
                <Checkbox title="Run on click" checked={f.run} onCheckedChange={(c) => onChange(hostFavs.map((x, j) => (j === i ? { ...x, run: !!c } : x)))} />
                <Checkbox title="Keep out of shell history" disabled={!f.run} checked={f.run && !!f.exec} onCheckedChange={(c) => onChange(hostFavs.map((x, j) => (j === i ? { ...x, exec: !!c } : x)))} />
                <Button size="icon-xs" variant="ghost" className="text-destructive" onClick={() => onChange(hostFavs.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="outline" className="justify-self-start" onClick={() => onChange([...hostFavs, { name: 'new', cmd: '', run: true, exec: true }])}>
            <Plus /> Add
          </Button>
          <p className="mt-2 text-xs font-medium">Global snippets (every host)</p>
          <ul className="grid gap-1">
            {snippets.map((f, i) => (
              <li key={i} className="grid grid-cols-[8rem_1fr_auto_auto_auto] items-center gap-1">
                <Input value={f.name} onChange={(e) => onSnippets(snippets.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="h-7 text-xs" />
                <Input value={f.cmd} onChange={(e) => onSnippets(snippets.map((x, j) => (j === i ? { ...x, cmd: e.target.value } : x)))} className="h-7 font-mono text-xs" spellCheck={false} />
                <Checkbox title="Run on click" checked={f.run} onCheckedChange={(c) => onSnippets(snippets.map((x, j) => (j === i ? { ...x, run: !!c } : x)))} />
                <Checkbox title="Keep out of shell history" disabled={!f.run} checked={f.run && !!f.exec} onCheckedChange={(c) => onSnippets(snippets.map((x, j) => (j === i ? { ...x, exec: !!c } : x)))} />
                <Button size="icon-xs" variant="ghost" className="text-destructive" onClick={() => onSnippets(snippets.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="outline" className="justify-self-start" onClick={() => onSnippets([...snippets, { name: 'new', cmd: '', run: true, exec: true }])}>
            <Plus /> Add snippet
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
