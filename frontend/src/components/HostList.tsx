import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, LayoutGrid, List, Pencil, Plus, Star, StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { DeleteHost, ImportHost, Reorder, SaveHost, SavedHost, Star as StarHost } from '../../wailsjs/go/main/App';
import { ClipboardSetText } from '../../wailsjs/runtime/runtime';
import { config } from '../../wailsjs/go/models';

export type HostStatus = 'connected' | 'connecting' | 'error' | undefined;

type Props = {
  hosts: config.Entry[];
  status: Record<string, HostStatus>; // by alias, from tab state
  onConnect(alias: string): void;
  onEdit(label: string | null): void; // null = new
  onRefresh(): void;
  onInstallKey(alias: string): void;
  onManageKeys(): void;
  onLocal?(): void; // undefined on Windows (no local PTY yet)
  docker: Record<string, boolean>; // aliases with an active docker bridge
  onDocker(alias: string, what: 'host' | 'context'): void;
  clusters: Record<string, boolean>; // group → is swarm
  onCluster(group: string): void;
  onMulti(aliases: string[]): void;
  mode: 'full' | 'icons'; // ⌘B cycles full → icons → hidden (hidden = not rendered)
  topPad: number; // px reserved for macOS traffic lights
};

const ago = (unix: number) => {
  if (!unix) return '';
  const m = Math.round((Date.now() / 1000 - unix) / 60);
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};
const dot = { connected: 'bg-emerald-400', connecting: 'bg-amber-400 animate-pulse', error: 'bg-red-400' };
const ls = {
  get: (k: string, d: string) => {
    try {
      return localStorage.getItem(k) ?? d;
    } catch {
      return d;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

/** Sidebar: grouped, collapsible, starred first, drag to reorder saved hosts, list or card view. */
export function HostList({ hosts, status, onConnect, onEdit, onRefresh, onInstallKey, onManageKeys, onLocal, docker, onDocker, clusters, onCluster, onMulti, mode, topPad }: Props) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(JSON.parse(ls.get('spean.collapsed', '[]'))));
  const [cards, setCards] = useState(() => ls.get('spean.view', 'list') === 'cards');
  const [drag, setDrag] = useState<string | null>(null);
  useEffect(() => ls.set('spean.collapsed', JSON.stringify([...collapsed])), [collapsed]);
  useEffect(() => ls.set('spean.view', cards ? 'cards' : 'list'), [cards]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () => (q ? hosts.filter((h) => [h.alias, h.hostName ?? '', h.user ?? '', h.group ?? '', ...(h.tags ?? [])].some((s) => s.toLowerCase().includes(q))) : hosts),
    [hosts, q],
  );
  const groups = useMemo(() => {
    const out: { name: string; entries: config.Entry[] }[] = [];
    for (const h of visible) {
      const name = h.group || 'Hosts';
      const g = out.find((x) => x.name === name) ?? (out.push({ name, entries: [] }), out[out.length - 1]);
      g.entries.push(h);
    }
    return out;
  }, [visible]);

  const toggle = (g: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });

  async function duplicate(label: string) {
    const h = await SavedHost(label);
    if (!h) return;
    await SaveHost(new config.SavedHost({ ...h, label: `${h.label} copy`, starred: false, order: 0, lastConnect: 0 }));
    onRefresh();
  }
  const sshCmd = (h: config.Entry) => `ssh ${h.alias}`; // config alias or saved label resolve the same way in Spean; plain ssh needs the alias
  async function dropOn(target: config.Entry) {
    if (!drag || drag === target.alias) return;
    const g = groups.find((x) => x.entries.some((e) => e.alias === target.alias));
    if (!g || !g.entries.some((e) => e.alias === drag)) return; // same group only
    const order = g.entries.map((e) => e.alias).filter((a) => a !== drag);
    order.splice(order.indexOf(target.alias), 0, drag);
    await Reorder(order.filter((a) => g.entries.find((e) => e.alias === a)?.saved));
    onRefresh();
  }

  const row = (h: config.Entry) => {
    const st = status[h.alias];
    return (
      <ContextMenu key={h.alias}>
        <ContextMenuTrigger
          render={
            <li
              draggable={h.saved}
              onDragStart={() => setDrag(h.alias)}
              onDragOver={(e) => drag && e.preventDefault()}
              onDrop={() => dropOn(h)}
              onDragEnd={() => setDrag(null)}
              onClick={() => onConnect(h.alias)}
              className={`group cursor-pointer hover:bg-accent ${
                cards ? 'flex flex-col gap-1 rounded-lg border p-2' : 'flex items-center gap-1.5 px-3 py-1.5'
              } ${drag === h.alias ? 'opacity-40' : ''}`}
            />
          }
        >
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className={`size-2 shrink-0 rounded-full ${st ? dot[st] : ''}`} style={!st && h.color ? { background: h.color } : undefined} />
            {h.starred && <Star className="size-3 shrink-0 fill-amber-400 text-amber-400" />}
            <span className="truncate">{h.alias}</span>
            {h.hasNotes && <StickyNote className="size-3 shrink-0 text-muted-foreground" />}
            {docker[h.alias] && (
              <span className="rounded bg-sky-500/20 px-1 text-[9px] text-sky-300" title="Docker socket bridged">
                docker
              </span>
            )}
          </span>
          <span className={`flex items-center gap-1 text-[10px] text-muted-foreground ${cards ? '' : 'shrink-0'}`}>
            {cards && h.hostName && <span className="truncate font-mono">{h.user ? `${h.user}@` : ''}{h.hostName}</span>}
            {h.tags?.map((t) => (
              <span key={t} className="rounded bg-muted px-1">
                {t}
              </span>
            ))}
            {h.lastConnect ? <span title="last connected">{ago(h.lastConnect)}</span> : null}
            {h.saved && (
              <Button
                size="icon-xs"
                variant="ghost"
                className="invisible group-hover:visible"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(h.alias);
                }}
              >
                <Pencil />
              </Button>
            )}
          </span>
        </ContextMenuTrigger>
        <ContextMenuContent className="text-xs">
          <ContextMenuItem onClick={() => onConnect(h.alias)}>Connect in new tab</ContextMenuItem>
          <ContextMenuItem onClick={() => StarHost(h.alias, !h.starred).then(onRefresh)}>{h.starred ? 'Unstar' : 'Star'}</ContextMenuItem>
          {h.saved ? (
            <>
              <ContextMenuItem onClick={() => onEdit(h.alias)}>Edit</ContextMenuItem>
              <ContextMenuItem onClick={() => duplicate(h.alias)}>Duplicate</ContextMenuItem>
              <ContextMenuItem variant="destructive" onClick={() => DeleteHost(h.alias).then(onRefresh)}>
                Delete
              </ContextMenuItem>
            </>
          ) : (
            <ContextMenuItem onClick={() => ImportHost(h.alias).then(onRefresh)}>Import as saved host</ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => ClipboardSetText(sshCmd(h))}>Copy ssh command</ContextMenuItem>
          <ContextMenuItem disabled={st !== 'connected'} onClick={() => onInstallKey(h.alias)}>
            Copy public key to this host…
          </ContextMenuItem>
          {docker[h.alias] && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => onDocker(h.alias, 'host')}>Copy DOCKER_HOST</ContextMenuItem>
              <ContextMenuItem onClick={() => onDocker(h.alias, 'context')}>Create docker context</ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  const initials = (a: string) =>
    a
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || a.slice(0, 2).toUpperCase();

  if (mode === 'icons') {
    return (
      <aside className="flex w-12 shrink-0 flex-col items-center bg-sidebar ring-1 ring-white/10" style={{ paddingTop: topPad, '--wails-draggable': 'drag' } as React.CSSProperties}>
        <ScrollArea className="min-h-0 flex-1 self-stretch">
          <ul className="flex flex-col items-center gap-1 py-2" style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}>
            {groups.map((g, gi) => (
              <Fragment key={g.name}>
                {gi > 0 && <li className="my-1 h-px w-6 bg-white/10" />}
                {g.entries.map((h) => {
                  const st = status[h.alias];
                  return (
                    <li key={h.alias}>
                      <button
                        type="button"
                        title={`${h.alias}${h.hostName ? ` · ${h.hostName}` : ''}${h.group ? ` · ${h.group}` : ''}`}
                        onClick={() => onConnect(h.alias)}
                        className="relative flex size-9 items-center justify-center rounded-lg text-[11px] font-medium hover:bg-accent"
                        style={{ boxShadow: h.color ? `inset 0 0 0 1.5px ${h.color}` : undefined }}
                      >
                        {initials(h.alias)}
                        {st && <span className={`absolute right-1 bottom-1 size-1.5 rounded-full ${dot[st]}`} />}
                        {h.starred && <Star className="absolute top-0.5 right-0.5 size-2 fill-amber-400 text-amber-400" />}
                      </button>
                    </li>
                  );
                })}
              </Fragment>
            ))}
          </ul>
        </ScrollArea>
        <Button size="icon-sm" variant="ghost" title="New host" className="mb-1" onClick={() => onEdit(null)}>
          <Plus />
        </Button>
      </aside>
    );
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-sidebar ring-1 ring-white/10" style={{ paddingTop: topPad, '--wails-draggable': 'drag' } as React.CSSProperties}>
      <form
        style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}
        className="flex gap-1.5 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          const target = visible.length === 1 ? visible[0].alias : query.trim(); // one match, or user@host literal
          if (target) {
            onConnect(target);
            setQuery('');
          }
        }}
      >
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search or user@host" spellCheck={false} className="h-8 text-xs" />
        <Button type="button" size="icon-sm" variant="outline" title="New host" onClick={() => onEdit(null)}>
          <Plus />
        </Button>
      </form>
      <ScrollArea className="flex-1" style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}>
        {!hosts.length && (
          <div className="grid gap-2 p-3 text-xs text-muted-foreground">
            <p>No hosts yet.</p>
            <Button size="sm" variant="outline" onClick={() => onEdit(null)}>
              Add host
            </Button>
          </div>
        )}
        {groups.map((g) => (
          <div key={g.name}>
            <ContextMenu>
              <ContextMenuTrigger
                render={
                  <button
                    type="button"
                    onClick={() => toggle(g.name)}
                    className="flex w-full items-center gap-1 px-2 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
                  />
                }
              >
                {collapsed.has(g.name) ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
                {g.name} <span className="font-normal">{g.entries.length}</span>
                {clusters[g.name] && <span className="rounded bg-sky-500/20 px-1 text-[9px] normal-case text-sky-300">swarm</span>}
              </ContextMenuTrigger>
              <ContextMenuContent className="text-xs">
                <ContextMenuItem onClick={() => onMulti(g.entries.map((e) => e.alias))}>Run command on all…</ContextMenuItem>
                {g.name !== 'Hosts' && <ContextMenuItem onClick={() => onCluster(g.name)}>{clusters[g.name] ? 'Cluster nodes…' : 'Mark as Swarm cluster…'}</ContextMenuItem>}
              </ContextMenuContent>
            </ContextMenu>
            {!collapsed.has(g.name) && <ul className={cards ? 'grid gap-1.5 px-2' : ''}>{g.entries.map(row)}</ul>}
          </div>
        ))}
      </ScrollArea>
      <div className="flex items-center gap-1 border-t p-1" style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}>
        <Button size="icon-sm" variant="ghost" title={cards ? 'List view' : 'Card view'} onClick={() => setCards((v) => !v)}>
          {cards ? <List /> : <LayoutGrid />}
        </Button>
        <Button size="sm" variant="ghost" className="text-xs" onClick={onManageKeys}>
          Keys
        </Button>
        {onLocal && (
          <Button size="sm" variant="ghost" className="ml-auto text-xs" title="Local terminal" onClick={onLocal}>
            Local
          </Button>
        )}
      </div>
    </aside>
  );
}
