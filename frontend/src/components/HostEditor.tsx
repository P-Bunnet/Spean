import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DeleteHost, ListKeys, SaveHost, SavedHost, TestConnection } from '../../wailsjs/go/main/App';
import { config } from '../../wailsjs/go/models';
import { themes } from '@/lib/settings';

const empty = (): config.SavedHost =>
  new config.SavedHost({ label: '', address: '', port: '', user: '', key: '', jump: '', group: '', tags: [], forwardAgent: false, snippet: '', forwards: [], dockerSock: '' });

type Props = {
  open: boolean;
  label?: string; // set when editing an existing saved host
  hosts: config.Entry[]; // pickable jump hosts (saved + ~/.ssh/config)
  onClose(): void;
  onSaved(): void;
  onManageKeys(): void;
  onConnect(alias: string): void; // Save & connect
  preset?: Partial<config.SavedHost>; // new host prefilled (e.g. "Add node as host")
};

type Hop = { kind: 'host'; alias: string } | { kind: 'custom'; value: string };
type HopResult = { status: 'ok' | 'error'; err?: string };

export function HostEditor({ open, label, hosts, onClose, onSaved, onManageKeys, onConnect, preset }: Props) {
  const [h, setH] = useState(empty);
  const [tags, setTags] = useState('');
  const [err, setErr] = useState('');
  const [keys, setKeys] = useState<{ name: string; ref: string }[]>([]);
  const [openSec, setOpenSec] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<Record<string, HopResult>>({});
  const [jumpOf, setJumpOf] = useState<Record<string, string>>({}); // saved host → its own jump (shown as a hint)

  const aliases = useMemo(() => new Set(hosts.map((x) => x.alias)), [hosts]);
  // Hops are editor state (an empty custom hop must survive re-renders); jump is derived from them on save.
  const [hops, setHops] = useState<Hop[]>([]);
  const parseHops = (jump: string): Hop[] =>
    (jump || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => (aliases.has(s) ? { kind: 'host', alias: s } : { kind: 'custom', value: s }));
  const serializeHops = (hs: Hop[]) =>
    hs
      .map((x) => (x.kind === 'host' ? x.alias : x.value.trim()))
      .filter(Boolean)
      .join(',');

  useEffect(() => {
    if (!open) return;
    setErr('');
    setResults({});
    setOpenSec({});
    ListKeys().then((k) => setKeys(k ?? []));
    if (!label) {
      setH(new config.SavedHost({ ...empty(), ...preset }));
      setTags((preset?.tags ?? []).join(', '));
      setHops(parseHops(preset?.jump ?? ''));
      return;
    }
    SavedHost(label).then((s) => {
      if (s) {
        setH(s);
        setTags((s.tags ?? []).join(', '));
        setHops(parseHops(s.jump));
      }
    });
  }, [open, label]); // eslint-disable-line react-hooks/exhaustive-deps

  // A picked saved host may bring its own chain (OpenSSH -J semantics honour the first hop's ProxyJump).
  useEffect(() => {
    hops.forEach((x) => {
      if (x.kind === 'host' && !(x.alias in jumpOf) && hosts.find((e) => e.alias === x.alias)?.saved) {
        SavedHost(x.alias).then((s) => setJumpOf((m) => ({ ...m, [x.alias]: s?.jump ?? '' })));
      }
    });
  }, [hops]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof config.SavedHost) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setH({ ...h, [k]: e.target.value } as config.SavedHost);
  const orgAuto = !!h.group || !!tags || !!h.color || !!h.starred || !!h.theme;
  const sec = (k: string, auto: boolean) => openSec[k] ?? auto; // opens by itself when it has content; the user can still fold it
  const toggle = (k: string, auto: boolean) => setOpenSec((o) => ({ ...o, [k]: !sec(k, auto) }));
  const final = () =>
    new config.SavedHost({ ...h, label: h.label.trim(), address: h.address.trim(), port: h.port || '22', jump: serializeHops(hops), tags: tags.split(',').map((s) => s.trim()).filter(Boolean) });
  const loop = hops.some((x) => x.kind === 'host' && x.alias === h.label.trim());

  async function save(e?: React.FormEvent, connect = false) {
    e?.preventDefault();
    if (loop) return setErr('a host cannot jump through itself');
    try {
      const out = final();
      if (label && label !== out.label) await DeleteHost(label); // renamed
      await SaveHost(out);
      onSaved();
      onClose();
      if (connect) onConnect(out.label);
    } catch (e) {
      setErr(String(e));
    }
  }

  async function testConn() {
    setTesting(true);
    setResults({});
    setErr('');
    try {
      await SaveHost(final()); // the chain resolves from the store
      onSaved();
      const r = await TestConnection(final().label);
      const map: Record<string, HopResult> = {};
      for (const p of r ?? []) map[p.alias] = { status: p.status as 'ok' | 'error', err: p.err };
      setResults(map);
    } catch (e) {
      setErr(String(e));
    }
    setTesting(false);
  }

  async function remove() {
    if (label) {
      await DeleteHost(label); // no confirm(): WKWebView has no native JS dialogs
      onSaved();
      onClose();
    }
  }

  // Test results come back keyed by the resolved alias (label / config alias / host part of a literal).
  const resultFor = (x: Hop | null) => {
    if (!x) return results[h.label.trim()];
    if (x.kind === 'host') return results[x.alias];
    const hostPart = x.value.replace(/^.*@/, '').replace(/:\d+$/, '');
    return results[hostPart];
  };
  const pill = (name: string, r: HopResult | undefined, key: string, last = false) => (
    <span key={key} className="flex items-center gap-1.5">
      <span
        className={`max-w-32 truncate rounded-full px-2.5 py-0.5 text-xs ring-1 ${
          r?.status === 'ok' ? 'bg-emerald-500/15 ring-emerald-500/40' : r?.status === 'error' ? 'bg-red-500/15 ring-red-500/40' : last ? 'brand-grad text-white ring-transparent' : 'bg-muted ring-white/10'
        }`}
        title={r?.err || name}
      >
        {r?.status === 'ok' ? '✓ ' : r?.status === 'error' ? '✗ ' : ''}
        {name}
      </span>
      {!last && <span className="text-muted-foreground">→</span>}
    </span>
  );
  const hopName = (x: Hop) => (x.kind === 'host' ? x.alias : x.value || '…');

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={save} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{label ? `Edit ${label}` : 'New host'}</DialogTitle>
          </DialogHeader>

          {/* route strip: you → hops → target */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-muted/40 px-3 py-2 ring-1 ring-white/10">
            <span className="text-xs text-muted-foreground">you</span>
            <span className="text-muted-foreground">→</span>
            {hops.map((x, i) => pill(hopName(x), resultFor(x), hopName(x) + i))}
            {pill(h.label.trim() || h.address.trim() || 'target', resultFor(null), '__target', true)}
            {testing && <span className="ml-2 text-xs text-muted-foreground">testing…</span>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Section title="Host">
              <Field label="Label">
                <Input value={h.label} onChange={set('label')} required placeholder="prod-web" />
              </Field>
              <Field label="Address">
                <div className="flex gap-1">
                  <Input value={h.address} onChange={set('address')} required spellCheck={false} placeholder="10.0.0.5 or host.example" className="font-mono" />
                  <Input value={h.port} onChange={set('port')} placeholder="22" className="w-16 font-mono" />
                </div>
              </Field>
              <Field label="User">
                <Input value={h.user} onChange={set('user')} spellCheck={false} placeholder="root" className="font-mono" />
              </Field>
              <Field label="Key">
                <div className="flex gap-1">
                  <select
                    value={keys.some((k) => k.ref === h.key) ? h.key : h.key ? 'custom' : ''}
                    onChange={(e) => e.target.value !== 'custom' && setH({ ...h, key: e.target.value } as config.SavedHost)}
                    className="h-8 min-w-0 flex-1 rounded-md bg-muted px-2 text-xs"
                  >
                    <option value="">Agent / default keys</option>
                    {keys.map((k) => (
                      <option key={k.ref} value={k.ref}>
                        {k.name}
                      </option>
                    ))}
                    {h.key && !keys.some((k) => k.ref === h.key) && <option value="custom">{h.key}</option>}
                  </select>
                  <Button type="button" size="sm" variant="outline" onClick={onManageKeys}>
                    Keys…
                  </Button>
                </div>
                <Input placeholder="…or a key path" value={h.key} onChange={set('key')} spellCheck={false} className="mt-1 h-7 font-mono text-xs" />
              </Field>
              <p className="text-[11px] text-muted-foreground">Passwords and passphrases are asked at connect time; tick Remember there to keep them in the vault.</p>
            </Section>

            <Section title="Route" hint="Hops in order. Pick a saved host, a ~/.ssh/config alias, or type user@host:port.">
              {hops.map((x, i) => {
                const own = x.kind === 'host' ? jumpOf[x.alias] : '';
                return (
                  <div key={i} className="grid gap-1">
                    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-1">
                      <select
                        value={x.kind === 'host' ? x.alias : '__custom'}
                        onChange={(e) => setHops(hops.map((y, j) => (j === i ? (e.target.value === '__custom' ? { kind: 'custom', value: '' } : { kind: 'host', alias: e.target.value }) : y)))}
                        className="h-8 min-w-0 rounded-md bg-muted px-2 text-xs"
                      >
                        <option value="__custom">Custom user@host:port…</option>
                        <optgroup label="Saved hosts">
                          {hosts
                            .filter((e) => e.saved && e.alias !== h.label.trim())
                            .map((e) => (
                              <option key={e.alias} value={e.alias}>
                                {e.alias}
                                {e.hostName ? ` · ${e.hostName}` : ''}
                              </option>
                            ))}
                        </optgroup>
                        <optgroup label="~/.ssh/config">
                          {hosts
                            .filter((e) => !e.saved)
                            .map((e) => (
                              <option key={e.alias} value={e.alias}>
                                {e.alias}
                                {e.hostName ? ` · ${e.hostName}` : ''}
                              </option>
                            ))}
                        </optgroup>
                      </select>
                      <Button type="button" size="icon-xs" variant="ghost" title="Move up" disabled={i === 0} onClick={() => setHops(swap(hops, i, i - 1))}>
                        <ArrowUp />
                      </Button>
                      <Button type="button" size="icon-xs" variant="ghost" title="Move down" disabled={i === hops.length - 1} onClick={() => setHops(swap(hops, i, i + 1))}>
                        <ArrowDown />
                      </Button>
                      <Button type="button" size="icon-xs" variant="ghost" className="text-destructive" title="Remove hop" onClick={() => setHops(hops.filter((_, j) => j !== i))}>
                        <Trash2 />
                      </Button>
                    </div>
                    {x.kind === 'custom' && (
                      <Input
                        autoFocus
                        value={x.value}
                        onChange={(e) => setHops(hops.map((y, j) => (j === i ? { kind: 'custom', value: e.target.value.replace(/,/g, '') } : y)))}
                        placeholder="user@bastion.example:22"
                        spellCheck={false}
                        className="h-7 font-mono text-xs"
                      />
                    )}
                    {own && i === 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        {x.kind === 'host' && x.alias} reaches through <span className="font-mono">{own}</span> first (its own route, like <code>ssh -J</code>).
                      </p>
                    )}
                    {own && i > 0 && <p className="text-[11px] text-amber-400">Only the first hop's own route is followed; this one is dialled directly from the previous hop.</p>}
                  </div>
                );
              })}
              <Button type="button" size="sm" variant="outline" className="justify-self-start" onClick={() => setHops([...hops, { kind: 'custom', value: '' }])}>
                <Plus /> Add hop
              </Button>
              {!hops.length && <p className="text-[11px] text-muted-foreground">Direct connection. Add a hop for each bastion between you and this host.</p>}
              {loop && <p className="text-xs text-destructive">A host cannot jump through itself.</p>}
            </Section>
          </div>

          <Collapsible title="Shell" open={sec('shell', !!h.forwardAgent || !!h.snippet)} onToggle={() => toggle('shell', !!h.forwardAgent || !!h.snippet)}>
            <Label className="flex items-center gap-2">
              <Checkbox checked={h.forwardAgent} onCheckedChange={(c) => setH({ ...h, forwardAgent: !!c } as config.SavedHost)} />
              Agent forwarding
            </Label>
            {h.forwardAgent && (
              <p className="text-[11px] text-muted-foreground">
                Forwarding lets this host use your local keys while you are connected; root on that host can too. Keep it off for hosts you do not trust.
              </p>
            )}
            <Textarea placeholder="Startup snippet (typed after login)" value={h.snippet} onChange={set('snippet')} rows={2} spellCheck={false} className="font-mono text-xs" />
          </Collapsible>

          <Collapsible title="Forwards & Docker" open={sec('fwd', !!h.forwards?.length || !!h.dockerSock)} onToggle={() => toggle('fwd', !!h.forwards?.length || !!h.dockerSock)}>
            <Forwards list={h.forwards ?? []} onChange={(f) => setH({ ...h, forwards: f } as config.SavedHost)} />
            <Label className="flex items-center gap-2">
              <Checkbox checked={!!h.dockerSock} onCheckedChange={(c) => setH({ ...h, dockerSock: c ? '/var/run/docker.sock' : '' } as config.SavedHost)} />
              Docker socket over SSH
            </Label>
            {h.dockerSock && (
              <Input value={h.dockerSock} onChange={set('dockerSock')} className="h-7 font-mono text-xs" spellCheck={false} placeholder="/var/run/docker.sock (rootless: /run/user/1000/docker.sock)" />
            )}
          </Collapsible>

          <Collapsible title="Organise" open={sec('org', orgAuto)} onToggle={() => toggle('org', orgAuto)}>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Group">
                <Input value={h.group} onChange={set('group')} placeholder="prod" />
              </Field>
              <Field label="Tags">
                <Input
                  placeholder="web, git"
                  value={tags}
                  onChange={(e) => {
                    setTags(e.target.value);
                    // git hosts want agent forwarding so pushes work; explained once, under the checkbox
                    if (/\bgit\b/i.test(e.target.value) && !/\bgit\b/i.test(tags)) setH({ ...h, forwardAgent: true } as config.SavedHost);
                  }}
                />
              </Field>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <Label className="flex items-center gap-2">
                <input type="color" value={h.color || '#38bdf8'} onChange={(e) => setH({ ...h, color: e.target.value } as config.SavedHost)} className="size-6 cursor-pointer rounded border-0 bg-transparent" />
                Colour
                {h.color && (
                  <button type="button" className="text-muted-foreground underline" onClick={() => setH({ ...h, color: '' } as config.SavedHost)}>
                    clear
                  </button>
                )}
              </Label>
              <Label className="flex items-center gap-2">
                <Checkbox checked={!!h.starred} onCheckedChange={(c) => setH({ ...h, starred: !!c } as config.SavedHost)} />
                Starred
              </Label>
              <Label className="flex items-center gap-2">
                Terminal theme
                <select value={h.theme ?? ''} onChange={(e) => setH({ ...h, theme: e.target.value } as config.SavedHost)} className="h-7 rounded bg-muted px-1 text-xs">
                  <option value="">default</option>
                  {Object.keys(themes).map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Label>
            </div>
          </Collapsible>

          {err && <p className="text-xs text-destructive">{err}</p>}
          {Object.values(results).some((r) => r.status === 'error') && (
            <p className="text-xs text-destructive">{Object.values(results).find((r) => r.status === 'error')?.err}</p>
          )}

          <DialogFooter className="sm:justify-between">
            <div className="flex gap-2">
              {label && (
                <Button type="button" variant="ghost" className="text-destructive" onClick={remove}>
                  Delete
                </Button>
              )}
              <Button type="button" variant="ghost" onClick={testConn} disabled={testing || !h.label.trim() || !h.address.trim() || loop}>
                Test connection
              </Button>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="outline" disabled={loop}>
                Save
              </Button>
              <Button type="button" className="brand-grad text-white" disabled={loop || !h.label.trim() || !h.address.trim()} onClick={() => save(undefined, true)}>
                Save & connect
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function swap<T>(a: T[], i: number, j: number) {
  const n = [...a];
  [n[i], n[j]] = [n[j], n[i]];
  return n;
}

function Forwards({ list, onChange }: { list: config.Forward[]; onChange(f: config.Forward[]): void }) {
  const upd = (i: number, patch: Partial<config.Forward>) => onChange(list.map((f, j) => (j === i ? new config.Forward({ ...f, ...patch }) : f)));
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        Port forwards (auto = start on connect)
        <Button type="button" size="xs" variant="outline" onClick={() => onChange([...list, new config.Forward({ kind: 'local', listen: '127.0.0.1:8080', target: 'localhost:80', auto: true })])}>
          <Plus /> Add
        </Button>
      </div>
      {list.map((f, i) => (
        <div key={i} className="grid grid-cols-[5rem_1fr_1fr_auto_auto] items-center gap-1">
          <select value={f.kind} onChange={(e) => upd(i, { kind: e.target.value })} className="h-7 rounded bg-muted px-1 text-xs">
            <option value="local">local</option>
            <option value="remote">remote</option>
            <option value="dynamic">dynamic</option>
          </select>
          <Input value={f.listen} onChange={(e) => upd(i, { listen: e.target.value })} className="h-7 font-mono text-xs" spellCheck={false} placeholder="listen" />
          <Input value={f.target} onChange={(e) => upd(i, { target: e.target.value })} className="h-7 font-mono text-xs" spellCheck={false} placeholder="target" disabled={f.kind === 'dynamic'} />
          <Checkbox title="Start on connect" checked={f.auto} onCheckedChange={(c) => upd(i, { auto: !!c })} />
          <Button type="button" size="icon-xs" variant="ghost" className="text-destructive" onClick={() => onChange(list.filter((_, j) => j !== i))}>
            <Trash2 />
          </Button>
        </div>
      ))}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid content-start gap-2 rounded-xl bg-muted/40 p-3 ring-1 ring-white/10">
      <legend className="float-left w-full pb-1 text-sm font-medium">{title}</legend>
      {hint && <p className="-mt-1 pb-1 text-[11px] text-muted-foreground">{hint}</p>}
      {children}
    </fieldset>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Collapsible({ title, open, onToggle, children }: { title: string; open: boolean; onToggle(): void; children: React.ReactNode }) {
  return (
    <div className="rounded-xl ring-1 ring-white/10">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-1 px-3 py-2 text-sm font-medium hover:bg-accent/50">
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        {title}
      </button>
      {open && <div className="grid gap-2 px-3 pb-3">{children}</div>}
    </div>
  );
}
