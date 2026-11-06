import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Play, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Runbooks as Load, SetRunbooks } from '../../wailsjs/go/main/App';
import { config } from '../../wailsjs/go/models';
import type { TermHandle } from '@/components/Term';

type Props = {
  open: boolean;
  onClose(): void;
  host?: string; // active host
  term: TermHandle | null; // its terminal
};

const holes = (s: string) => [...new Set([...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))];

// `;` or a lone `&` would split a step once joined with &&; braces keep it one unit.
const unit = (cmd: string) => (/;|(^|[^&])&([^&]|$)/.test(cmd) ? `{ ${cmd}; }` : cmd);

/** Runbooks: steps typed into the shell. Steps up to the next Confirm go as one `a && b` line, so the shell stops at the first failure. */
export function Runbooks({ open, onClose, host, term }: Props) {
  const [books, setBooks] = useState<config.Runbook[]>([]);
  const [sel, setSel] = useState(0);
  const [run, setRun] = useState<{ book: config.Runbook; i: number; vals: Record<string, string>; phase: 'ask' | 'wait' | 'done' } | null>(null);
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
    setRun({ book: b, i: 0, vals: Object.fromEntries(names.map((n) => [n, ''])), phase: names.length ? 'ask' : 'wait' });
  }
  const fill = (cmd: string, vals: Record<string, string>) => Object.entries(vals).reduce((c, [k, v]) => c.replaceAll(`{{${k}}}`, v), cmd);
  const until = (r: NonNullable<typeof run>) => {
    let j = r.i + 1;
    while (j < r.book.steps.length && !r.book.steps[j].confirm) j++;
    return j;
  };
  function step() {
    if (!run || !term) return;
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
            <DialogDescription>Ordered steps typed into the shell. Steps run as one `a && b` line, stopping at the first failure; tick Confirm to pause before a step. `{'{{name}}'}` asks once at the start.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
            <div className="grid content-start gap-1">
              {books.map((b, i) => (
                <button key={i} type="button" onClick={() => setSel(i)} className={`truncate rounded-md px-2 py-1 text-left text-xs ${i === sel ? 'bg-accent' : 'hover:bg-accent/50'}`}>
                  {b.name || 'untitled'} <span className="text-muted-foreground">· {b.steps.length}</span>
                </button>
              ))}
              <Button size="sm" variant="outline" onClick={() => save([...books, new config.Runbook({ name: 'new runbook', steps: [new config.Step({ cmd: '', confirm: false })] })])}>
                <Plus /> New
              </Button>
            </div>
            {book ? (
              <div className="grid content-start gap-2">
                <div className="flex gap-2">
                  <Input value={book.name} onChange={(e) => upd({ name: e.target.value })} className="h-8" />
                  <Button size="sm" className="brand-grad text-white" disabled={!host || !term || !book.steps.length} title={host ? `run on ${host}` : 'open a tab first'} onClick={() => start(book)}>
                    <Play /> Run on {host ?? '…'}
                  </Button>
                  <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => save(books.filter((_, i) => i !== sel))}>
                    <Trash2 />
                  </Button>
                </div>
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
      <Dialog open={!!run} onOpenChange={(o) => !o && setRun(null)}>
        <DialogContent className="sm:max-w-lg" showCloseButton={false}>
          {run && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {run.book.name} on {host}
                </DialogTitle>
                <DialogDescription>
                  {run.phase === 'done' ? 'All steps typed into the shell.' : `Step ${run.i + 1} of ${run.book.steps.length}`}
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
              <ol className="grid gap-1 font-mono text-xs">
                {run.book.steps.map((s, j) => (
                  <li key={j} className={`flex items-start gap-2 rounded-md px-2 py-1 ${j === run.i && run.phase !== 'done' ? 'bg-accent' : ''}`}>
                    <span className="w-5 shrink-0 text-muted-foreground">{j < run.i ? '✓' : `${j + 1}.`}</span>
                    <span className="min-w-0 flex-1">
                      <span className="break-all">{fill(s.cmd, run.vals)}</span>
                      {s.note && <span className="block text-[10px] text-muted-foreground">{s.note}</span>}
                    </span>
                  </li>
                ))}
              </ol>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRun(null)}>
                  {run.phase === 'done' ? 'Close' : 'Abort'}
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
