import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Exec } from '../../wailsjs/go/main/App';
import type { config } from '../../wailsjs/go/models';

type View = 'services' | 'tasks' | 'nodes' | 'stacks' | 'containers';
type Row = Record<string, string>;
const views: View[] = ['services', 'tasks', 'nodes', 'stacks', 'containers'];
// every table is `docker … --format '{{json .}}'`, one JSON object per line
const cmds: Record<View, string> = {
  services: "docker service ls --format '{{json .}}'",
  tasks: "ids=$(docker service ls -q 2>/dev/null); [ -n \"$ids\" ] && docker service ps $ids --no-trunc --format '{{json .}}'",
  nodes: "docker node ls --format '{{json .}}'",
  stacks: "docker stack ls --format '{{json .}}'",
  containers: "docker ps --format '{{json .}}'", // running only; `all` state appends -a
};
const cols: Record<View, string[]> = {
  services: ['Name', 'Mode', 'Replicas', 'Image', 'Ports'],
  tasks: ['Name', 'Node', 'DesiredState', 'CurrentState', 'Error'],
  nodes: ['Hostname', 'Status', 'Availability', 'ManagerStatus', 'EngineVersion'],
  stacks: ['Name', 'Services'],
  containers: ['Names', 'Image', 'Status', 'Ports'],
};
const SH = "sh -c 'command -v bash >/dev/null && exec bash || exec sh'";
const byTask = (id: string) => `$(docker ps -q --filter label=com.docker.swarm.task.id=${id})`;
const portRe = /(?:\d+\.\d+\.\d+\.\d+|::|\*):(\d+)->\d+\/(?:tcp|udp)/g;

type Props = {
  sid: string;
  alias: string;
  nodes: config.Node[]; // cluster mapping for the host's group (may be empty)
  onClose?(): void;
  run(cmd: string): boolean; // type into this tab's shell
  openCmd(alias: string, cmd: string, title: string): void; // new tab running cmd
  inspect(title: string, json: string): void; // read-only editor tab
  forward(port: number): void; // local forward to the published port, then browser
  addNode(hostname: string): void; // unknown swarm node → host editor prefilled
  onNotice?(text: string, sub: string, tone: 'ok' | 'warn' | 'err'): void; // watch mode: something changed
};

/** Right-pane Docker/Swarm tables over the tab's chain. Every action is a real docker command, shown before it runs. */
export function DockerPanel({ sid, alias, nodes, run, openCmd, inspect, forward, addNode, onNotice }: Props) {
  const [view, setView] = useState<View>('containers');
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [every, setEvery] = useState(0); // seconds; 0 = off
  const [confirm, setConfirm] = useState<{ title: string; cmd: string; input?: string; value?: string } | null>(null);
  const [filter, setFilter] = useState('');
  const [all, setAll] = useState(false); // containers: include stopped (docker ps -a)
  const prev = useRef<{ view: View; rows: Row[] } | null>(null);
  const everyRef = useRef(0);
  everyRef.current = every;

  // Watch: on auto-refresh, tell the user what moved (replica counts, failed tasks, container state).
  function diff(view: View, rows: Row[]) {
    const p = prev.current;
    prev.current = { view, rows };
    if (!p || p.view !== view || !everyRef.current || !onNotice) return;
    const key = view === 'containers' ? 'ID' : view === 'nodes' ? 'Hostname' : view === 'tasks' ? 'ID' : 'Name';
    const old = new Map(p.rows.map((r) => [r[key], r]));
    for (const r of rows) {
      const o = old.get(r[key]);
      if (view === 'services' && o && o.Replicas !== r.Replicas) {
        const [n, m] = (r.Replicas ?? '').split('/').map(Number);
        onNotice(`${alias}: ${r.Name} ${o.Replicas} → ${r.Replicas}`, 'service replicas', n < m ? 'warn' : 'ok');
      } else if (view === 'tasks' && !o && /^(Failed|Rejected)/.test(r.CurrentState ?? '')) {
        onNotice(`${alias}: task ${r.Name} ${r.CurrentState}`, r.Error || r.Node, 'err');
      } else if (view === 'containers' && o && o.State !== r.State) {
        onNotice(`${alias}: ${r.Names} ${o.State} → ${r.State}`, r.Status, r.State === 'running' ? 'ok' : 'warn');
      } else if (view === 'nodes' && o && (o.Status !== r.Status || o.Availability !== r.Availability)) {
        onNotice(`${alias}: node ${r.Hostname} ${r.Status} / ${r.Availability}`, r.ManagerStatus, r.Status === 'Ready' && r.Availability === 'Active' ? 'ok' : 'warn');
      }
    }
  }

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await Exec(sid, view === 'containers' && all ? cmds.containers.replace('docker ps', 'docker ps -a') : cmds[view]);
      if (r.exit !== 0 && !r.stdout) {
        setErr(r.stderr.trim() || `exit ${r.exit}`);
        setRows([]);
      } else {
        setErr('');
        const parsed = r.stdout
            .split('\n')
            .filter(Boolean)
            .map((l) => {
              try {
                return JSON.parse(l) as Row;
              } catch {
                return null;
              }
            })
            .filter((x): x is Row => !!x);
        setRows(parsed);
        diff(view, parsed);
      }
    } catch (e) {
      setErr(String(e));
    }
    setBusy(false);
  }, [sid, view, all]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!every) return;
    const t = setInterval(load, every * 1000);
    return () => clearInterval(t);
  }, [every, load]);

  const nodeAlias = (hostname: string) => nodes.find((n) => n.hostname === hostname)?.alias;
  const doInspect = async (kind: string, id: string) => {
    const r = await Exec(sid, `docker ${kind ? kind + ' ' : ''}inspect ${id}`);
    inspect(`${kind || 'task'} ${id.slice(0, 12)}`, r.exit === 0 ? r.stdout : r.stderr);
  };
  const typed = (cmd: string) => {
    if (!run(cmd)) setErr('tab closed — reconnect, then retry');
  };
  const fire = () => {
    if (!confirm) return;
    typed(confirm.input ? confirm.cmd.replace('{{}}', confirm.value ?? '') : confirm.cmd);
    setConfirm(null);
    setTimeout(load, 1500);
  };

  // colour rules: replicas n/m, task state, container state
  const tone = (r: Row): string => {
    if (view === 'services') {
      const [n, m] = (r.Replicas ?? '').split('/').map(Number);
      if (m && n === 0) return 'text-red-400';
      if (m && n < m) return 'text-amber-400';
    }
    if (view === 'tasks' && /^(Failed|Rejected|Shutdown)/.test(r.CurrentState ?? '')) return 'text-red-400';
    if (view === 'nodes' && (r.Status !== 'Ready' || r.Availability !== 'Active')) return 'text-amber-400';
    if (view === 'containers' && r.State !== 'running') return 'text-muted-foreground';
    return '';
  };

  const menu = (r: Row) => {
    switch (view) {
      case 'services':
        return (
          <>
            <ContextMenuItem onClick={() => openCmd(alias, `docker service logs -f --tail 200 ${r.Name}`, `${alias} › ${r.Name} logs`)}>Logs</ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                setFilter(r.Name);
                setView('tasks');
              }}
            >
              Tasks
            </ContextMenuItem>
            <ContextMenuItem onClick={() => setConfirm({ title: `Force update ${r.Name}`, cmd: `docker service update --force ${r.Name}` })}>Force update</ContextMenuItem>
            <ContextMenuItem onClick={() => setConfirm({ title: `Scale ${r.Name}`, cmd: `docker service scale ${r.Name}={{}}`, input: 'replicas', value: (r.Replicas ?? '').split('/')[1] })}>
              Scale…
            </ContextMenuItem>
            <ContextMenuItem onClick={() => doInspect('service', r.Name)}>Inspect</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onClick={() => setConfirm({ title: `Remove service ${r.Name}`, cmd: `docker service rm ${r.Name}` })}>
              Remove
            </ContextMenuItem>
          </>
        );
      case 'tasks': {
        const a = nodeAlias(r.Node);
        return (
          <>
            {a ? (
              <>
                <ContextMenuItem onClick={() => openCmd(a, `docker exec -it ${byTask(r.ID)} ${SH}`, `${a} › ${r.Name}`)}>Shell into task (on {a})</ContextMenuItem>
                <ContextMenuItem onClick={() => openCmd(a, `docker logs -f --tail 200 ${byTask(r.ID)}`, `${a} › ${r.Name} logs`)}>Logs on node</ContextMenuItem>
              </>
            ) : (
              <ContextMenuItem onClick={() => addNode(r.Node)}>Add node {r.Node} as host…</ContextMenuItem>
            )}
            <ContextMenuItem onClick={() => doInspect('', r.ID)}>Inspect task</ContextMenuItem>
          </>
        );
      }
      case 'nodes': {
        const a = nodeAlias(r.Hostname);
        const drain = r.Availability === 'Active';
        return (
          <>
            {a ? <ContextMenuItem onClick={() => openCmd(a, '', a)}>Shell on node</ContextMenuItem> : <ContextMenuItem onClick={() => addNode(r.Hostname)}>Add node as host…</ContextMenuItem>}
            <ContextMenuItem onClick={() => setConfirm({ title: `${drain ? 'Drain' : 'Activate'} ${r.Hostname}`, cmd: `docker node update --availability ${drain ? 'drain' : 'active'} ${r.Hostname}` })}>
              {drain ? 'Drain' : 'Activate'}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => doInspect('node', r.Hostname)}>Inspect</ContextMenuItem>
          </>
        );
      }
      case 'stacks':
        return (
          <>
            <ContextMenuItem
              onClick={() => {
                setFilter(r.Name + '_');
                setView('services');
              }}
            >
              Services
            </ContextMenuItem>
            <ContextMenuItem onClick={() => openCmd(alias, `docker stack ps ${r.Name} --no-trunc`, `${alias} › stack ${r.Name}`)}>Tasks (stack ps)</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onClick={() => setConfirm({ title: `Remove stack ${r.Name}`, cmd: `docker stack rm ${r.Name}` })}>
              Remove
            </ContextMenuItem>
          </>
        );
      case 'containers':
        return (
          <>
            <ContextMenuItem onClick={() => openCmd(alias, `docker logs -f --tail 200 ${r.ID}`, `${alias} › ${r.Names} logs`)}>Logs</ContextMenuItem>
            <ContextMenuItem onClick={() => openCmd(alias, `docker exec -it ${r.ID} ${SH}`, `${alias} › ${r.Names}`)}>Shell</ContextMenuItem>
            <ContextMenuItem onClick={() => setConfirm({ title: `Restart ${r.Names}`, cmd: `docker restart ${r.ID}` })}>Restart</ContextMenuItem>
            <ContextMenuItem onClick={() => setConfirm({ title: `${r.State === 'running' ? 'Stop' : 'Start'} ${r.Names}`, cmd: `docker ${r.State === 'running' ? 'stop' : 'start'} ${r.ID}` })}>
              {r.State === 'running' ? 'Stop' : 'Start'}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => doInspect('container', r.ID)}>Inspect</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onClick={() => setConfirm({ title: `Remove ${r.Names}`, cmd: `docker rm -f ${r.ID}` })}>
              Remove
            </ContextMenuItem>
          </>
        );
    }
  };

  const cell = (r: Row, c: string) => {
    const v = r[c] ?? '';
    if (c === 'Ports' && v) {
      const parts: React.ReactNode[] = [];
      let last = 0;
      for (const m of v.matchAll(portRe)) {
        parts.push(v.slice(last, m.index));
        const port = Number(m[1]);
        parts.push(
          <button key={m.index} type="button" className="text-sky-400 hover:underline" title={`forward localhost → ${port} and open`} onClick={() => forward(port)}>
            {m[0]}
          </button>,
        );
        last = m.index! + m[0].length;
      }
      parts.push(v.slice(last));
      return parts;
    }
    if (c === 'Node' && v) {
      const a = nodeAlias(v);
      return (
        <span title={a ? `→ ${a}` : 'no Spean host mapped (right-click to add)'} className={a ? '' : 'text-amber-400'}>
          {v}
        </span>
      );
    }
    return v;
  };

  const f = filter.toLowerCase();
  const shown = f ? rows.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(f))) : rows;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col text-xs">
      <div className="flex flex-wrap items-center gap-1 border-b p-1.5">
        {views.map((v) => (
          <Button key={v} size="xs" variant={view === v ? 'default' : 'ghost'} onClick={() => setView(v)}>
            {v}
          </Button>
        ))}
        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="filter" className="ml-1 h-6 w-28 text-xs" />
        {view === 'containers' && (
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground" title="docker ps -a">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="accent-brand" /> stopped too
          </label>
        )}
        <select value={every} onChange={(e) => setEvery(Number(e.target.value))} className="ml-auto h-6 rounded bg-muted px-1" title="Auto refresh">
          <option value={0}>manual</option>
          <option value={5}>watch · 5 s</option>
          <option value={30}>watch · 30 s</option>
        </select>
        <Button size="icon-xs" variant="ghost" title="Refresh" onClick={load} disabled={busy}>
          <RefreshCw className={busy ? 'animate-spin' : ''} />
        </Button>
      </div>
      {err && <div className="border-b px-2 py-1 text-destructive">{err}</div>}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-max">
          <thead className="sticky top-0 bg-background text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              {cols[view].map((c) => (
                <th key={c} className="px-2 py-1 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <ContextMenu key={r.ID ?? r.Name ?? i}>
                <ContextMenuTrigger render={<tr className={`border-t hover:bg-accent ${tone(r)}`} />}>
                  {cols[view].map((c) => (
                    <td key={c} className="max-w-64 truncate px-2 py-1 font-mono" title={r[c]}>
                      {cell(r, c)}
                    </td>
                  ))}
                </ContextMenuTrigger>
                <ContextMenuContent className="text-xs">{menu(r)}</ContextMenuContent>
              </ContextMenu>
            ))}
          </tbody>
        </table>
        {!shown.length && !err && <p className="p-3 text-muted-foreground">{busy ? 'loading…' : 'nothing here'}</p>}
      </div>
      <div className="border-t px-2 py-1 text-[10px] text-muted-foreground">right-click a row for actions · they run in this tab's shell</div>

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          {confirm && (
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                fire();
              }}
            >
              <DialogHeader>
                <DialogTitle>{confirm.title}</DialogTitle>
                <DialogDescription className="font-mono text-xs">{confirm.input ? confirm.cmd.replace('{{}}', confirm.value || '…') : confirm.cmd}</DialogDescription>
              </DialogHeader>
              {confirm.input && <Input autoFocus type="number" min={0} value={confirm.value} onChange={(e) => setConfirm({ ...confirm, value: e.target.value })} placeholder={confirm.input} />}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setConfirm(null)}>
                  Cancel
                </Button>
                <Button type="submit">Run</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
