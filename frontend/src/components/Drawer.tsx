import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ForwardStop, TransferCancel, TransferRetry, Transfers } from '../../wailsjs/go/main/App';
import { BrowserOpenURL, EventsOn } from '../../wailsjs/runtime/runtime';
import type { forward, transfer } from '../../wailsjs/go/models';

const fmt = (n: number) => (n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(2)} GB`);
const base = (p: string) => p.replace(/\/$/, '').split('/').pop() || p;
const arrow = { local: '→', remote: '←', dynamic: '⇢ SOCKS', docker: '⇄ docker' };

/** Bottom drawer: transfers (this session) and active forwards. Hidden when both are empty. */
export function Drawer({ forwards, labels }: { forwards: forward.Forward[]; labels: Record<string, string> }) {
  const [jobs, setJobs] = useState<transfer.Job[]>([]);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    Transfers().then((j) => setJobs(j ?? []));
    return EventsOn('transfer:update', (j: transfer.Job) => setJobs((js) => (js.some((x) => x.id === j.id) ? js.map((x) => (x.id === j.id ? j : x)) : [...js, j])));
  }, []);
  const fwds = forwards.filter((f) => f.active);
  if (!jobs.length && !fwds.length) return null;
  const name = (src: string) => labels[src] ?? (src === 'local' ? 'Local' : src);
  const running = jobs.filter((j) => j.status === 'running' || j.status === 'queued').length;
  const summary = [jobs.length ? `${jobs.length} transfer${jobs.length > 1 ? 's' : ''}${running ? ` · ${running} active` : ''}` : '', fwds.length ? `${fwds.length} forward${fwds.length > 1 ? 's' : ''}` : '']
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="ring-1 ring-white/10 text-xs">
      <button type="button" className="flex w-full items-center gap-2 px-3 py-1 text-muted-foreground hover:bg-accent" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />}
        {summary}
      </button>
      {open && (
        <div className="max-h-[40vh] overflow-y-auto">
          {fwds.map((f) => (
            <div key={'f' + f.id} className="flex items-center gap-2 px-3 py-1">
              <span className="rounded bg-muted px-1 text-[10px] uppercase">{f.kind}</span>
              <span className="truncate font-mono">
                {f.listen} {arrow[f.kind as keyof typeof arrow]} {f.kind === 'dynamic' ? '' : f.target}
              </span>
              <span className="text-muted-foreground">on {labels[f.tabId] ?? f.tabId}</span>
              <span className="ml-auto text-muted-foreground">{fmt(f.bytes)}</span>
              {f.err && <span className="text-destructive">{f.err}</span>}
              {f.kind === 'local' && (
                <Button size="icon-xs" variant="ghost" title="Open in browser" onClick={() => BrowserOpenURL('http://' + f.listen.replace('127.0.0.1', 'localhost'))}>
                  <ExternalLink />
                </Button>
              )}
              <Button size="icon-xs" variant="ghost" title="Stop" onClick={() => ForwardStop(f.id)}>
                <X />
              </Button>
            </div>
          ))}
          {jobs.map((j) => {
            const pct = j.total ? (j.bytes / j.total) * 100 : j.status === 'done' ? 100 : 0;
            const eta = j.bps > 0 ? Math.round((j.total - j.bytes) / j.bps) : 0;
            const active = j.status === 'running' || j.status === 'queued';
            return (
              <div key={j.id} className="grid grid-cols-[1fr_auto] gap-x-3 px-3 py-1">
                <div className="min-w-0">
                  <div className="flex gap-2">
                    <span className="truncate">
                      {j.from.paths?.length === 1 ? base(j.from.paths[0]) : `${j.from.paths?.length} items`} · {name(j.from.src)} → {name(j.to.src)}
                      {j.move ? ' (move)' : ''}
                    </span>
                    <span className="ml-auto shrink-0 text-muted-foreground">
                      {j.status === 'running'
                        ? `${j.done}/${j.items?.length ?? 0} · ${fmt(j.bytes)}/${fmt(j.total)}${j.bps ? ` · ${fmt(j.bps)}/s` : ''}${eta ? ` · ${eta}s` : ''}`
                        : j.status}
                    </span>
                  </div>
                  <div className="mt-0.5 h-1 rounded bg-muted">
                    <div className={`h-1 rounded ${j.status === 'error' ? 'bg-destructive' : j.status === 'cancelled' ? 'bg-muted-foreground' : 'brand-grad'}`} style={{ width: `${pct}%` }} />
                  </div>
                  {j.err && <div className="truncate text-destructive">{j.err}</div>}
                </div>
                <div className="flex items-center">
                  {active ? (
                    <Button size="icon-xs" variant="ghost" title="Cancel" onClick={() => TransferCancel(j.id)}>
                      <X />
                    </Button>
                  ) : j.status === 'error' ? (
                    <Button size="icon-xs" variant="ghost" title="Retry failed files" onClick={() => TransferRetry(j.id)}>
                      <RotateCcw />
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
