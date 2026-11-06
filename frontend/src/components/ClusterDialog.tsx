import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ClusterDetect, SetGroup } from '../../wailsjs/go/main/App';
import { config } from '../../wailsjs/go/models';

type Props = {
  group: string | null;
  meta?: config.GroupMeta;
  hosts: config.Entry[];
  onClose(): void;
  onChanged(): void;
  onRunOnManager(group: string, cmd: string): void; // types into a manager's tab
  onOpen(alias: string): void;
};

/** Swarm cluster view for a group: detect nodes, map them to hosts, drain/activate. */
export function ClusterDialog({ group, meta, hosts, onClose, onChanged, onRunOnManager, onOpen }: Props) {
  const [g, setG] = useState<config.GroupMeta | undefined>(meta);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    setG(meta);
    setMsg('');
  }, [meta, group]);
  if (!group) return null;

  async function detect() {
    setMsg('running docker node ls…');
    try {
      const r = await ClusterDetect(group!);
      setG(r);
      setMsg(`${r.nodes?.length ?? 0} nodes`);
      onChanged();
    } catch (e) {
      setMsg(String(e));
    }
  }
  async function map(hostname: string, alias: string) {
    const next = new config.GroupMeta({ ...g, kind: 'swarm', map: { ...(g?.map ?? {}), [hostname]: alias } });
    if (!alias && next.map) delete next.map[hostname];
    next.nodes = (g?.nodes ?? []).map((n) => (n.hostname === hostname ? new config.Node({ ...n, alias }) : n));
    await SetGroup(group!, next);
    setG(next);
    onChanged();
  }
  async function unmark() {
    await SetGroup(group!, new config.GroupMeta({ kind: '', nodes: [], map: {} }));
    onChanged();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cluster · {group}</DialogTitle>
          <DialogDescription>
            Nodes come from <code>docker node ls</code> on any member. Map each node to the Spean host that reaches it; multi-exec and the task → node hop use this.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 text-xs">
          <Button size="sm" onClick={detect}>
            {g?.kind === 'swarm' ? 'Refresh nodes' : 'Mark as Swarm and detect'}
          </Button>
          {g?.kind === 'swarm' && (
            <Button size="sm" variant="ghost" onClick={unmark}>
              Unmark
            </Button>
          )}
          <span className="text-muted-foreground">{msg}</span>
        </div>
        {g?.nodes?.length ? (
          <table className="w-full text-xs">
            <thead className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="py-1">Node</th>
                <th>Role</th>
                <th>Status</th>
                <th>Availability</th>
                <th>Host</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {g.nodes.map((n) => (
                <tr key={n.id} className="border-t">
                  <td className="py-1 font-mono">{n.hostname}</td>
                  <td>{n.role}</td>
                  <td className={n.status === 'Ready' ? 'text-emerald-400' : 'text-destructive'}>{n.status}</td>
                  <td className={n.availability === 'Active' ? '' : 'text-amber-400'}>{n.availability}</td>
                  <td>
                    <select value={n.alias ?? ''} onChange={(e) => map(n.hostname, e.target.value)} className="h-6 rounded bg-muted px-1">
                      <option value="">unknown</option>
                      {hosts.map((h) => (
                        <option key={h.alias} value={h.alias}>
                          {h.alias}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {n.alias && (
                      <Button size="xs" variant="ghost" onClick={() => onOpen(n.alias!)}>
                        Shell
                      </Button>
                    )}
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => onRunOnManager(group, `docker node update --availability ${n.availability === 'Active' ? 'drain' : 'active'} ${n.hostname}`)}
                    >
                      {n.availability === 'Active' ? 'Drain' : 'Activate'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-xs text-muted-foreground">No nodes yet.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
