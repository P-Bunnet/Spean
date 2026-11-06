import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Play, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Runbooks as Load, SetRunbooks, StepRun, StepStart, StepStop } from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import { config } from '../../wailsjs/go/models';
import type { TermHandle } from '@/components/Term';

type Props = {
  open: boolean;
  onClose(): void;
  host?: string; // active host
  term: TermHandle | null; // its terminal
  tabId?: string; // its tab, for runbooks kept out of shell history
};

const holes = (s: string) => [...new Set([...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))];

// `;` or a lone `&` would split a step once joined with &&; braces keep it one unit.
const unit = (cmd: string) => (/;|(^|[^&])&([^&]|$)/.test(cmd) ? `{ ${cmd}; }` : cmd);

/**
 * Runbooks. Kept out of history: steps run one by one in a step shell, so each has its own exit code and output.
 * Otherwise: typed into the shell, with steps up to the next Confirm as one `a && b` line, so the shell stops at the first failure.
 */
export function Runbooks({ open, onClose, host, term, tabId }: Props) {
  const [books, setBooks] = useState<config.Runbook[]>([]);
  const [sel, setSel] = useState(0);
  const [run, setRun] = useState<{ book: config.Runbook; i: number; vals: Record<string, string>; phase: 'ask' | 'wait' | 'running' | 'failed' | 'done'; exits: Record<number, number>; out: Record<number, string>; err?: string } | null>(null);
  const [live, setLive] = useState('');
  const shell = useRef<{ id: string; off(): void } | null>(null);
  const runGen = useRef(0); // bumped on abort, so a shell still starting does not run the steps
  useEffect(() => {
    if (open) Load().then((b) => setBooks(b ?? []));
  }, [open]);
  const save = (b: config.Runbook[]) => {
    setBooks(b);
    SetRunbooks(b);
  };
  const book = books[sel];
  const upd = (patch: Partial<config.Runbook>) => save(books.map((b, i) => (i === sel ? new config.Runbook({ ...b, ...patch }) : b)));
  const updStep = (j: number, patch: Partial<config.Step>) => upd({ steps: book.steps.map((s, k) => (k === j ? new config.Step({ ...s, ...patch }) : s)) });
  const swap = (a: number, b: number) => {
    const st = [...book.steps];
    [st[a], st[b]] = [st[b], st[a]];
    upd({ steps: st });
  };

  // ---- execution ----
  function start(b: config.Runbook) {
    const names = holes(b.steps.map((s) => s.cmd).join('\n'));
    setRun({ book: b, i: 0, vals: Object.fromEntries(names.map((n) => [n, ''])), phase: names.length ? 'ask' : 'wait', exits: {}, out: {} });
  }
  function stop() {
    runGen.current++;
    shell.current?.off();
    if (shell.current) StepStop(shell.current.id);
    shell.current = null;
    setRun(null);
  }
  const fill = (cmd: string, vals: Record<string, string>) => Object.entries(vals).reduce((c, [k, v]) => c.replaceAll(`{{${k}}}`, v), cmd);
  const until = (r: NonNullable<typeof run>) => {
    let j = r.i + 1;
    while (j < r.book.steps.length && !r.book.steps[j].confirm) j++;
    return j;
  };
  async function stepQuiet(r: NonNullable<typeof run>) {
    const j = until(r);
    setRun({ ...r, phase: 'running' });
    const gen = runGen.current;
    try {
      if (!shell.current) {
        const id = await StepStart(tabId!);
        if (gen !== runGen.current) return StepStop(id);
        shell.current = { id, off: EventsOn('step:' + id, (l: string) => setLive((t) => (t + l).slice(-1 << 20))) };
      }
      for (let k = r.i; k < j; k++) {
        setLive('');
        setRun((x) => x && { ...x, i: k });
        const res = await StepRun(shell.current!.id, fill(r.book.steps[k].cmd, r.vals));
        setRun((x) => x && { ...x, exits: { ...x.exits, [k]: res.exit }, out: { ...x.out, [k]: res.stdout }, phase: res.exit ? 'failed' : x.phase });
        if (res.exit) return;
      }
      setRun((x) => x && { ...x, i: j, phase: j >= r.book.steps.length ? 'done' : 'wait' });
    } catch (e) {
      setRun((x) => x && { ...x, phase: 'failed', err: String(e) });
    }
  }
  function step() {
    if (!run || !term) return;
    if (run.book.exec) return void stepQuiet(run);
    const j = until(run);
    if (!term.run(run.book.steps.slice(run.i, j).map((s) => unit(fill(s.cmd, run.vals))).join(' && '))) return; // tab closed
    setRun({ ...run, i: j, phase: j >= run.book.steps.length ? 'done' : 'wait' });
  }

  return (
    <>
      <Dialog open={open && !run} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Runbooks</DialogTitle>
            <DialogDescription>Ordered steps that stop at the first failure; tick Confirm to pause before a step. `{'{{name}}'}` asks once at the start.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
            <div className="grid content-start gap-1">
              {books.map((b, i) => (
                <button key={i} type="button" onClick={() => setSel(i)} className={`truncate rounded-md px-2 py-1 text-left text-xs ${i === sel ? 'bg-accent' : 'hover:bg-accent/50'}`}>
                  {b.name || 'untitled'} <span className="text-muted-foreground">· {b.steps.length}</span>
                </button>
              ))}
              <Button size="sm" variant="outline" onClick={() => save([...books, new config.Runbook({ name: 'new runbook', exec: true, steps: [new config.Step({ cmd: '', confirm: false })] })])}>
                <Plus /> New
              </Button>
            </div>
            {book ? (
              <div className="grid content-start gap-2">
                <div className="flex gap-2">
                  <Input value={book.name} onChange={(e) => upd({ name: e.target.value })} className="h-8" />
                  <Button size="sm" className="brand-grad text-brand-fg" disabled={!host || !term || !book.steps.length} title={host ? `run on ${host}` : 'open a tab first'} onClick={() => start(book)}>
                    <Play /> Run on {host ?? '…'}
                  </Button>
                  <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => save(books.filter((_, i) => i !== sel))}>
                    <Trash2 />
                  </Button>
                </div>
                <Label className="flex items-center gap-2 text-[11px]">
                  <Checkbox checked={!!book.exec} onCheckedChange={(c) => upd({ exec: !!c })} />
                  Keep out of shell history (`cd` and `export` carry between steps; no sudo prompts or full-screen programs)
                </Label>
                {book.steps.map((s, j) => (
                  <div key={j} className="grid gap-1 rounded-lg bg-muted/40 p-2 ring-1 ring-white/10">
                    <div className="flex items-center gap-1">
                      <span className="w-5 text-[10px] text-muted-foreground">{j + 1}.</span>
                      <Input value={s.cmd} onChange={(e) => updStep(j, { cmd: e.target.value })} placeholder="command" className="h-7 font-mono text-xs" spellCheck={false} />
                      <Button size="icon-xs" variant="ghost" disabled={j === 0} onClick={() => swap(j, j - 1)}>
                        <ArrowUp />
                      </Button>
                      <Button size="icon-xs" variant="ghost" disabled={j === book.steps.length - 1} onClick={() => swap(j, j + 1)}>
                        <ArrowDown />
                      </Button>
                      <Button size="icon-xs" variant="ghost" className="text-destructive" onClick={() => upd({ steps: book.steps.filter((_, k) => k !== j) })}>
                        <Trash2 />
                      </Button>
                    </div>
                    <div className="ml-5 flex items-center gap-2">
                      <Input value={s.note ?? ''} onChange={(e) => updStep(j, { note: e.target.value })} placeholder="note shown before this step (optional)" className="h-6 text-[11px]" />
                      <Label className="flex shrink-0 items-center gap-1 text-[11px]">
                        <Checkbox checked={!!s.confirm} onCheckedChange={(c) => updStep(j, { confirm: !!c })} /> confirm
                      </Label>
                    </div>
                  </div>
                ))}
                <Button size="sm" variant="outline" className="justify-self-start" onClick={() => upd({ steps: [...book.steps, new config.Step({ cmd: '', confirm: false })] })}>
                  <Plus /> Step
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No runbooks yet. Example: `git pull --ff-only` → `docker compose build` → confirm → `docker compose up -d` → `docker compose ps`.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* stepper */}
      <Dialog open={!!run} onOpenChange={(o) => !o && stop()}>
        <DialogContent className="sm:max-w-lg" showCloseButton={false}>
          {run && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {run.book.name} on {host}
                </DialogTitle>
                <DialogDescription>
                  {run.phase === 'done' ? (run.book.exec ? 'All steps finished.' : 'All steps typed into the shell.') : run.phase === 'failed' ? (run.err ?? `Step ${run.i + 1} failed. Remaining steps did not run.`) : `Step ${run.i + 1} of ${run.book.steps.length}`}
                </DialogDescription>
              </DialogHeader>
              {run.phase === 'ask' && (
                <div className="grid gap-2">
                  {Object.keys(run.vals).map((k) => (
                    <Label key={k} className="grid gap-1">
                      <span className="font-mono text-xs text-muted-foreground">{`{{${k}}}`}</span>
                      <Input value={run.vals[k]} onChange={(e) => setRun({ ...run, vals: { ...run.vals, [k]: e.target.value } })} />
                    </Label>
                  ))}
                </div>
              )}
              <ol className="grid max-h-[60vh] gap-1 overflow-y-auto font-mono text-xs">
                {run.book.steps.map((s, j) => (
                  <li key={j} className={`flex items-start gap-2 rounded-md px-2 py-1 ${j === run.i && run.phase !== 'done' ? 'bg-accent' : ''}`}>
                    <span className={`w-5 shrink-0 ${run.exits[j] ? 'text-destructive' : 'text-muted-foreground'}`}>{run.exits[j] ? '✗' : j < run.i || run.exits[j] === 0 ? '✓' : `${j + 1}.`}</span>
                    <span className="min-w-0 flex-1">
                      <span className="break-all">{fill(s.cmd, run.vals)}</span>
                      {s.note && <span className="block text-[10px] text-muted-foreground">{s.note}</span>}
                      {!!run.exits[j] && <span className="block text-[10px] text-destructive">exit {run.exits[j]}</span>}
                      {(run.out[j] ?? (j === run.i && run.phase === 'running' ? live : '')).trimEnd() && (
                        <pre className="mt-1 max-h-48 overflow-auto rounded bg-background/60 p-1.5 text-[11px] whitespace-pre-wrap">{(run.out[j] ?? live).trimEnd()}</pre>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
              <DialogFooter>
                <Button variant="outline" onClick={stop}>
                  {run.phase === 'done' || run.phase === 'failed' ? 'Close' : 'Abort'}
                </Button>
                {run.phase === 'ask' && (
                  <Button onClick={() => setRun({ ...run, phase: 'wait' })} disabled={Object.values(run.vals).some((v) => !v)}>
                    Start
                  </Button>
                )}
                {run.phase === 'wait' && <Button onClick={step}>{until(run) - run.i > 1 ? `Run steps ${run.i + 1}–${until(run)}` : `Run step ${run.i + 1}`}</Button>}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
