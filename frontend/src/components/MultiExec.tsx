import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ClusterManager, MultiExec as Run } from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import type { config } from '../../wailsjs/go/models';

type Props = {
  open: { cmd?: string; aliases?: string[] } | null;
  onClose(): void;
  hosts: config.Entry[];
  groups: Record<string, config.GroupMeta>;
};
type Out = { text: string; done: boolean; exit?: number; err?: string };

/** Run one command on N hosts; outputs stream into a grid. Reuses open tabs' chains. */
export function MultiExec({ open, onClose, hosts, groups }: Props) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [cmd, setCmd] = useState('');
  const [out, setOut] = useState<Record<string, Out>>({});
  const [running, setRunning] = useState(false);
  const [stacked, setStacked] = useState(false);
  useEffect(() => {
    if (open) {
      setSel(new Set(open.aliases ?? []));
      setCmd(open.cmd ?? '');
      setOut({});
    }
  }, [open]);

  const byGroup = useMemo(() => {
    const m = new Map<string, config.Entry[]>();
    for (const h of hosts) m.set(h.group || 'Hosts', [...(m.get(h.group || 'Hosts') ?? []), h]);
    return [...m.entries()];
  }, [hosts]);
  const toggle = (a: string, on: boolean) =>
    setSel((s) => {
      const n = new Set(s);
      if (on) n.add(a);
      else n.delete(a);
      return n;
    });

  async function run(targets = [...sel]) {
    if (!targets.length || !cmd.trim()) return;
    setRunning(true);
    setOut(Object.fromEntries(targets.map((a) => [a, { text: '', done: false }])));
    const id = await Run(targets, cmd);
    const off = EventsOn('exec:' + id, (m: { alias?: string; data?: string; done?: boolean; exit?: number; err?: string; all?: boolean }) => {
      if (m.all) {
        setRunning(false);
        off();
        return;
      }
      setOut((o) => ({
        ...o,
        [m.alias!]: { text: (o[m.alias!]?.text ?? '') + (m.data ?? ''), done: !!m.done, exit: m.exit, err: m.err },
      }));
    });
  }
  async function runOnManager(group: string) {
    const m = await ClusterManager(group);
    if (m) run([m]);
  }

  const entries = Object.entries(out);
  return (
    <Dialog open={!!open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Run on many hosts</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 gap-3">
          <div className="w-52 shrink-0 overflow-y-auto text-xs">
            {byGroup.map(([g, list]) => {
              const all = list.every((h) => sel.has(h.alias));
              const cluster = groups[g]?.kind === 'swarm';
              return (
                <div key={g} className="mb-2">
                  <Label className="flex items-center gap-2 py-1 font-medium uppercase tracking-wider text-muted-foreground">
                    <Checkbox checked={all} onCheckedChange={(c) => list.forEach((h) => toggle(h.alias, !!c))} />
                    {g} {cluster && <span className="rounded bg-sky-500/20 px-1 text-[9px] normal-case text-sky-300">swarm</span>}
                  </Label>
                  {cluster && (
                    <button type="button" className="ml-6 text-sky-400 hover:underline" onClick={() => runOnManager(g)} disabled={running || !cmd.trim()}>
                      run on a manager
                    </button>
                  )}
                  {list.map((h) => (
                    <Label key={h.alias} className="ml-4 flex items-center gap-2 py-0.5">
                      <Checkbox checked={sel.has(h.alias)} onCheckedChange={(c) => toggle(h.alias, !!c)} />
                      {h.alias}
                    </Label>
                  ))}
                </div>
              );
            })}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                run();
              }}
            >
              <Input autoFocus value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder="uptime" className="font-mono" spellCheck={false} />
              <Button type="submit" disabled={running || !sel.size || !cmd.trim()}>
                Run on {sel.size}
              </Button>
              <Button type="button" variant="outline" onClick={() => setStacked((v) => !v)}>
                {stacked ? 'Grid' : 'Stack'}
              </Button>
            </form>
            <div className={`min-h-0 flex-1 overflow-y-auto ${stacked ? 'grid gap-2' : 'grid grid-cols-2 gap-2'}`}>
              {entries.map(([alias, o]) => (
                <div key={alias} className="flex min-h-24 flex-col rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 px-2 py-1 text-xs">
                    <span className="font-medium">{alias}</span>
                    <span className={`ml-auto ${o.err || o.exit ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {o.err ? o.err : o.done ? `exit ${o.exit}` : 'running…'}
                    </span>
                  </div>
                  <pre className="max-h-64 overflow-auto px-2 pb-2 font-mono text-[11px] whitespace-pre-wrap">{o.text}</pre>
                </div>
              ))}
              {!entries.length && <p className="text-xs text-muted-foreground">Pick hosts, type a command, Enter.</p>}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
