import { useEffect, useState } from 'react';
import { ExternalLink, Play, RefreshCw, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ForwardStart, ForwardStop, ListenPorts, SavedHost } from '../../wailsjs/go/main/App';
import { BrowserOpenURL } from '../../wailsjs/runtime/runtime';
import type { config, forward, main } from '../../wailsjs/go/models';

type Props = {
  sid: string;
  alias: string;
  forwards: forward.Forward[]; // all active forwards (App state)
  onNotice(text: string): void;
};

const fmt = (n: number) => (n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const httpish = (port: number, proc?: string) => [80, 443, 3000, 3001, 4000, 5000, 5173, 8000, 8080, 8443, 8888, 9000, 9090].includes(port) || /nginx|node|python|caddy|httpd|traefik|grafana|docker-proxy/.test(proc ?? '');

/** What the host is listening on, and the forwards you have to it. One click from "it runs on :3000" to a browser tab. */
export function PortsPane({ sid, alias, forwards, onNotice }: Props) {
  const [ports, setPorts] = useState<main.ListenPort[]>([]);
  const [saved, setSaved] = useState<config.Forward[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const mine = forwards.filter((f) => f.active && f.tabId === sid);
  const local = mine.filter((f) => f.kind === 'local');

  const load = async () => {
    setBusy(true);
    try {
      setPorts((await ListenPorts(sid)) ?? []);
      setErr('');
    } catch (e) {
      setErr(String(e));
    }
    setBusy(false);
  };
  useEffect(() => {
    load();
    SavedHost(alias).then((h) => setSaved(h?.forwards ?? [])).catch(() => setSaved([]));
  }, [sid, alias]); // eslint-disable-line react-hooks/exhaustive-deps

  const forwardOf = (port: number) => local.find((f) => f.target.endsWith(':' + port));
  async function forward(port: number, open: boolean) {
    const existing = forwardOf(port);
    try {
      const f = existing ?? (await ForwardStart(sid, 'local', '127.0.0.1:0', `127.0.0.1:${port}`));
      if (open) BrowserOpenURL('http://localhost:' + f.listen.split(':').pop());
      else onNotice(`localhost:${f.listen.split(':').pop()} → ${alias}:${port}`);
    } catch (e) {
      setErr(String(e));
    }
  }
  const savedActive = (s: config.Forward) => mine.find((f) => f.kind === s.kind && (s.kind === 'dynamic' ? true : f.target === s.target) && (s.kind === 'remote' ? f.listen === s.listen : true));
  async function toggleSaved(s: config.Forward) {
    const a = savedActive(s);
    if (a) return ForwardStop(a.id);
    try {
      await ForwardStart(sid, s.kind, s.listen, s.target);
    } catch (e) {
      setErr(String(e));
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col text-xs">
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <span className="font-medium">Listening on {alias}</span>
        <Button size="icon-xs" variant="ghost" className="ml-auto" title="Refresh" onClick={load} disabled={busy}>
          <RefreshCw className={busy ? 'animate-spin' : ''} />
        </Button>
      </div>
      {err && <p className="px-3 py-1 text-destructive">{err}</p>}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full">
          <tbody>
            {ports.map((p) => {
              const f = forwardOf(p.port);
              return (
                <tr key={p.port} className="border-b border-white/5 hover:bg-accent/50">
                  <td className="w-16 px-3 py-1 font-mono">{p.port}</td>
                  <td className="w-28 truncate px-1 py-1 font-mono text-muted-foreground">{p.addr}</td>
                  <td className="truncate px-1 py-1">{p.proc}</td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    {f ? (
                      <>
                        <span className="mr-1 font-mono text-emerald-400">localhost:{f.listen.split(':').pop()}</span>
                        <Button size="icon-xs" variant="ghost" title="Open in browser" onClick={() => BrowserOpenURL('http://localhost:' + f.listen.split(':').pop())}>
                          <ExternalLink />
                        </Button>
                        <Button size="icon-xs" variant="ghost" title="Stop forward" onClick={() => ForwardStop(f.id)}>
                          <Square />
                        </Button>
                      </>
                    ) : (
                      <>
                        {httpish(p.port, p.proc) && (
                          <Button size="xs" variant="outline" onClick={() => forward(p.port, true)}>
                            Forward & open
                          </Button>
                        )}
                        <Button size="icon-xs" variant="ghost" title="Forward to a local port" onClick={() => forward(p.port, false)}>
                          <Play />
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {!ports.length && !busy && (
              <tr>
                <td colSpan={4} className="px-3 py-2 text-muted-foreground">
                  {err ? '' : 'nothing listening, or ss/netstat missing on the host'}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {saved.length > 0 && (
          <>
            <div className="border-y px-3 py-1.5 font-medium">Saved forwards</div>
            {saved.map((s, i) => {
              const a = savedActive(s);
              return (
                <div key={i} className="flex items-center gap-2 border-b border-white/5 px-3 py-1">
                  <span className="rounded bg-muted px-1 text-[10px] uppercase">{s.kind}</span>
                  <span className="truncate font-mono">
                    {s.listen}
                    {s.kind !== 'dynamic' ? ` → ${s.target}` : ''}
                  </span>
                  {a && <span className="text-muted-foreground">{fmt(a.bytes)}</span>}
                  <Button size="xs" variant={a ? 'outline' : 'default'} className="ml-auto" onClick={() => toggleSaved(s)}>
                    {a ? 'Stop' : 'Start'}
                  </Button>
                </div>
              );
            })}
          </>
        )}

        {mine.filter((f) => f.kind !== 'local' || !ports.some((p) => f.target.endsWith(':' + p.port))).length > 0 && (
          <>
            <div className="border-y px-3 py-1.5 font-medium">Other active forwards on this tab</div>
            {mine
              .filter((f) => f.kind !== 'local' || !ports.some((p) => f.target.endsWith(':' + p.port)))
              .map((f) => (
                <div key={f.id} className="flex items-center gap-2 border-b border-white/5 px-3 py-1">
                  <span className="rounded bg-muted px-1 text-[10px] uppercase">{f.kind}</span>
                  <span className="truncate font-mono">
                    {f.listen} {f.kind === 'dynamic' ? '(SOCKS)' : `→ ${f.target}`}
                  </span>
                  <span className="ml-auto text-muted-foreground">{fmt(f.bytes)}</span>
                  <Button size="icon-xs" variant="ghost" title="Stop" onClick={() => ForwardStop(f.id)}>
                    <Square />
                  </Button>
                </div>
              ))}
          </>
        )}
      </div>
    </div>
  );
}
