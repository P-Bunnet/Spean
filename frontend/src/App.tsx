import { useCallback, useEffect, useRef, useState } from 'react';
import { MOD, setPlatform } from '@/lib/keys';
import { Container, Eraser, FileText, FolderOpen, Lock, LockOpen, Pause, Play, Radio, Settings2, SplitSquareHorizontal, SplitSquareVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Term, type TermHandle } from '@/components/Term';
import { Editor, type EditorHandle } from '@/components/Editor';
import { FavoriteBar } from '@/components/FavoriteBar';
import { FileBrowser } from '@/components/FileBrowser';
import { ForwardDialog } from '@/components/ForwardDialog';
import { Drawer } from '@/components/Drawer';
import { EmptyState } from '@/components/EmptyState';
import { RightPane, type RightTab } from '@/components/RightPane';
import { HostEditor } from '@/components/HostEditor';
import { HistoryPalette } from '@/components/HistoryPalette';
import { HostList, type HostStatus } from '@/components/HostList';
import { KeyManager } from '@/components/KeyManager';
import { MultiExec } from '@/components/MultiExec';
import { NotesPane } from '@/components/NotesPane';
import { PortsPane } from '@/components/PortsPane';
import { Runbooks } from '@/components/Runbooks';
import { ClusterDialog } from '@/components/ClusterDialog';
import { DockerPanel } from '@/components/DockerPanel';
import { Onboarding } from '@/components/Onboarding';
import { PromptDialog } from '@/components/PromptDialog';
import { SettingsDialog } from '@/components/SettingsDialog';
import { SplitView } from '@/components/SplitView';
import { Toasts, type Toast } from '@/components/Toasts';
import { VaultDialog } from '@/components/VaultDialog';
import { MagnetTabs } from '@/components/block/magnet-tabs';
import { Spotlight, type Extra } from '@/components/block/spotlight';
import { JellyLoader } from '@/components/block/jelly-loader';
import {
  CheckUpdate, ClusterManager, Connect, ConnectLocal, Disconnect, DockerContextCreate, DockerHost, Favorites, ForwardStart, Forwards, Groups, HistoryAdd, Hosts, LastSession, LogStart, LogStop, VaultAutoUnlock,
  Platform, SaveSession, SavedHost, SetFavorites, SetSnippets, Snippets, VaultLock, VaultRemember, VaultStatus, Write,
} from '../wailsjs/go/main/App';
import { BrowserOpenURL, ClipboardSetText, EventsOn } from '../wailsjs/runtime/runtime';
import { config, main, type forward } from '../wailsjs/go/models';
import type { Fav } from '@/packs';
import { loadSettings, saveSettings, themes, useSettings } from '@/lib/settings';

type Hop = { alias: string; status: 'connecting' | 'ok' | 'error'; err?: string };
/** One shell. Backend ids, events and Term handles are keyed by sid. */
type Session = { sid: string; alias: string; hops: Hop[]; status: string; closed: boolean; local?: boolean; log?: string; title?: string; paused?: boolean; activity?: 'output' | 'bell' };
type TermTab = { kind: 'term'; id: string; sessions: Session[]; dir: 'row' | 'col'; focus: string };
type EditorTab = { kind: 'editor'; id: string; src: string; path: string; dirty: boolean; text?: string };
type Tab = TermTab | EditorTab;
const glyph = { connecting: '…', ok: '✓', error: '✗' };
let nextId = 1;
const ls = (k: string) => {
  try {
    return localStorage.getItem(k) ?? '';
  } catch {
    return '';
  }
};

export default function App() {
  const terms = useRef<Record<string, TermHandle | null>>({});
  const editors = useRef<Record<string, React.RefObject<EditorHandle | null>>>({});
  const [hosts, setHosts] = useState<config.Entry[]>([]);
  const [groups, setGroups] = useState<Record<string, config.GroupMeta>>({});
  const [loaded, setLoaded] = useState(false);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState<string>();
  const [editing, setEditing] = useState<string | null | undefined>(undefined); // undefined = closed, null = new
  const [spotlight, setSpotlight] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [selMenu, setSelMenu] = useState<{ sid: string; text: string; x: number; y: number } | null>(null);
  const [starText, setStarText] = useState<string | undefined>();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [runbooks, setRunbooks] = useState(false);
  const toast = (t: Omit<Toast, 'id'>, ttl = 8000) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts.slice(-4), { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), ttl);
  };
  const [goto, setGoto] = useState<{ sid: string; path: string; n: number } | undefined>();
  const [right, setRight] = useState<RightTab | null>(null); // Files or Docker in the right slot
  const [sidebar, setSidebar] = useState<'full' | 'icons' | 'hidden'>(() => (ls('spean.sidebar') as 'full' | 'icons' | 'hidden') || 'full');
  const [mac, setMac] = useState(false); // hidden title bar: traffic lights sit over our chrome
  const [os, setOs] = useState('darwin');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [favs, setFavs] = useState<Record<string, Fav[]>>({});
  const [snippets, setSnippetsState] = useState<Fav[]>([]);
  const [starSignal, setStarSignal] = useState(0);
  const [hotkey, setHotkey] = useState(0);
  const [confirm, setConfirm] = useState<{ title: string; body?: string; ok: string; remember?: boolean; resolve(v: boolean, remember?: boolean): void } | null>(null);
  const [vault, setVault] = useState<{ exists: boolean; locked: boolean }>({ exists: false, locked: true });
  const [vaultMode, setVaultMode] = useState<'unlock' | 'create' | null>(null);
  const vaultWaiters = useRef<((ok: boolean) => void)[]>([]);
  // Opens once the launch-time unlock is settled. Connects wait for it: stored passwords are only read
  // when a connect starts, so one that starts earlier asks for a password the vault already holds.
  const [vaultGate] = useState(() => {
    let open = () => {};
    const wait = new Promise<void>((r) => (open = r));
    return { wait, open };
  });
  const [keysOpen, setKeysOpen] = useState<{ pick?: (ref: string) => void } | null>(null);
  const [fwds, setFwds] = useState<forward.Forward[]>([]);
  const [fwdFor, setFwdFor] = useState<{ id: string; label: string } | null>(null);
  const [multi, setMulti] = useState<{ cmd?: string; aliases?: string[] } | null>(null);
  const [cluster, setCluster] = useState<string | null>(null);
  const [preset, setPreset] = useState<Partial<config.SavedHost> | undefined>();
  const [broadcast, setBroadcast] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(t);
  }, [notice]);
  const settings = useSettings();
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeRef = useRef(active);
  activeRef.current = active;
  const broadcastRef = useRef(broadcast);
  broadcastRef.current = broadcast;
  const pendingCmd = useRef<Record<string, string>>({}); // sid → command to type once the shell is up

  useEffect(() => {
    Forwards().then((f) => setFwds(f ?? []));
    return EventsOn('forward:update', (f: forward.Forward) => setFwds((fs) => (fs.some((x) => x.id === f.id) ? fs.map((x) => (x.id === f.id ? f : x)) : [...fs, f])));
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('spean.sidebar', sidebar);
    } catch {}
  }, [sidebar]);
  useEffect(() => {
    loadSettings();
    Platform().then((p) => {
      setPlatform(p);
      setMac(p === 'darwin');
      setOs(p);
    });
    Snippets().then((s) => setSnippetsState(s ?? []));
    VaultAutoUnlock().then((ok) =>
      VaultStatus().then((v) => {
        setVault(v);
        if (!ok && v.exists && v.locked) {
          vaultWaiters.current.push(vaultGate.open);
          setVaultMode('unlock'); // skippable
        } else vaultGate.open();
      }),
    );
  }, []);

  const ask = (title: string, ok: string, body?: string, remember = false) =>
    new Promise<{ ok: boolean; remember: boolean }>((resolve) =>
      setConfirm({ title, body, ok, remember, resolve: (v, r) => resolve({ ok: v, remember: !!r }) }),
    ).finally(() => setConfirm(null));

  // ---- vault ----
  const needVault = () =>
    new Promise<boolean>((resolve) => {
      if (!vault.locked) return resolve(true);
      vaultWaiters.current.push(resolve);
      setVaultMode(vault.exists ? 'unlock' : 'create');
    });
  const vaultDone = (ok: boolean) => {
    setVaultMode(null);
    VaultStatus().then(setVault);
    vaultWaiters.current.splice(0).forEach((f) => f(ok));
  };
  const remember = async (alias: string, kind: string, value: string) => {
    if (await needVault()) VaultRemember(alias, kind, value).catch(() => {});
  };
  const lockVault = () => {
    VaultLock();
    setVault((v) => ({ ...v, locked: true }));
  };

  // ---- hosts ----
  const refresh = useCallback(
    () =>
      Promise.all([Hosts(), Groups()]).then(([h, g]) => {
        setHosts(h ?? []);
        setGroups(g ?? {});
        setLoaded(true);
      }),
    [],
  );
  useEffect(() => {
    refresh();
  }, [refresh]);

  // ---- tabs & sessions ----
  const patchTab = <T extends Tab>(id: string, f: (t: T) => Partial<T>) => setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, ...f(t as T) } : t)));
  const patchSession = (sid: string, f: (s: Session) => Partial<Session>) =>
    setTabs((ts) => ts.map((t) => (t.kind === 'term' && t.sessions.some((s) => s.sid === sid) ? { ...t, sessions: t.sessions.map((s) => (s.sid === sid ? { ...s, ...f(s) } : s)) } : t)));

  // Auto-reconnect after a dropped transport: 2 s, 4 s, 8 s, 16 s, 30 s, then give up. Enter cancels/forces.
  const retry = useRef<Record<string, { timer: number; n: number }>>({});
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  function scheduleReconnect(sid: string) {
    const r = retry.current[sid] ?? { timer: 0, n: 0 };
    if (r.n >= 5) {
      terms.current[sid]?.write('\r\n\x1b[90m[gave up after 5 attempts] press Enter to reconnect\x1b[0m\r\n');
      delete retry.current[sid];
      return;
    }
    const wait = [2, 4, 8, 16, 30][r.n];
    terms.current[sid]?.write(`\r\n\x1b[90m[reconnecting in ${wait} s, attempt ${r.n + 1}/5 — Enter to retry now]\x1b[0m\r\n`);
    r.n++;
    r.timer = window.setTimeout(() => {
      const s = sessionsRef.current.find((x) => x.sid === sid);
      if (s?.closed) connect(sid, s.alias, s.local);
    }, wait * 1000);
    retry.current[sid] = r;
  }
  const sessionsRef = useRef<Session[]>([]);

  const listen = useCallback((sid: string) => {
    const offExit = EventsOn('term:exit:' + sid, (msg: string) => {
      const lost = msg.startsWith('connection lost');
      terms.current[sid]?.write(`\r\n\x1b[90m[${msg}]${lost && settingsRef.current?.autoReconnect ? '' : ' press Enter to reconnect'}\x1b[0m\r\n`);
      patchSession(sid, () => ({ closed: true, status: 'disconnected', log: undefined }));
      if (lost && settingsRef.current?.autoReconnect) scheduleReconnect(sid);
    });
    const offProg = EventsOn('connect:progress:' + sid, (p: Hop) => {
      patchSession(sid, (s) => {
        const i = s.hops.findIndex((h) => h.alias === p.alias);
        return { hops: i >= 0 ? s.hops.map((h, j) => (j === i ? p : h)) : [...s.hops, p] };
      });
      if (p.err) terms.current[sid]?.write(`\r\n\x1b[31m${p.err}\x1b[0m\r\n`);
    });
    return () => {
      offExit();
      offProg();
    };
  }, []);
  const unsub = useRef<Record<string, () => void>>({});

  async function connect(sid: string, alias: string, local = false) {
    if (retry.current[sid]) clearTimeout(retry.current[sid].timer);
    patchSession(sid, () => ({ hops: [], status: 'connecting', closed: false }));
    terms.current[sid]?.reset();
    if (!local) await vaultGate.wait;
    const { cols, rows } = terms.current[sid]?.size() ?? { cols: 80, rows: 24 };
    try {
      await (local ? ConnectLocal(sid, cols, rows) : Connect(sid, alias, cols, rows));
      delete retry.current[sid]; // back: reset the backoff
      patchSession(sid, () => ({ status: '' }));
      const cmd = pendingCmd.current[sid];
      delete pendingCmd.current[sid];
      if (cmd) terms.current[sid]?.run(cmd); // the shell buffers it until its first prompt
      terms.current[sid]?.focus();
      refresh(); // last-connected timestamps
    } catch (e) {
      patchSession(sid, () => ({ status: String(e), closed: true }));
      if (retry.current[sid]) scheduleReconnect(sid); // mid-backoff: keep trying
    }
  }

  function newSession(alias: string, local: boolean): Session {
    const sid = String(nextId++);
    unsub.current[sid] = listen(sid);
    if (!local && !favs[alias]) Favorites(alias).then((f) => setFavs((m) => ({ ...m, [alias]: f ?? [] })));
    requestAnimationFrame(() => connect(sid, alias, local)); // Term mounts first so cols/rows are real
    return { sid, alias, hops: [], status: 'connecting', closed: false, local };
  }
  function openTab(alias: string, local = false) {
    const s = newSession(alias, local);
    const id = String(nextId++);
    setTabs((ts) => [...ts, { kind: 'term', id, sessions: [s], dir: 'row', focus: s.sid }]);
    setActive(id);
  }
  function split(dir: 'row' | 'col') {
    const t = tabsRef.current.find((x) => x.id === activeRef.current);
    if (t?.kind !== 'term') return;
    const cur = t.sessions.find((s) => s.sid === t.focus) ?? t.sessions[0];
    const s = newSession(cur.alias, !!cur.local);
    patchTab<TermTab>(t.id, (x) => ({ sessions: [...x.sessions, s], dir, focus: s.sid }));
  }
  function openEditor(src: string, path: string, text?: string) {
    const existing = text === undefined && tabs.find((t) => t.kind === 'editor' && t.src === src && t.path === path);
    if (existing) return setActive(existing.id);
    const id = String(nextId++);
    editors.current[id] = { current: null };
    setTabs((ts) => [...ts, { kind: 'editor', id, src, path, dirty: false, text }]);
    setActive(id);
  }
  // A tab to alias that types cmd once connected (container shells, log tails).
  function openCmd(alias: string, cmd: string, title: string) {
    const sess = newSession(alias, false);
    sess.title = title;
    if (cmd) pendingCmd.current[sess.sid] = cmd;
    const id = String(nextId++);
    setTabs((ts) => [...ts, { kind: 'term', id, sessions: [sess], dir: 'row', focus: sess.sid }]);
    setActive(id);
  }
  async function forwardAndOpen(sid: string, port: number) {
    try {
      const f = await ForwardStart(sid, 'local', '127.0.0.1:0', `127.0.0.1:${port}`);
      BrowserOpenURL('http://localhost:' + f.listen.split(':').pop());
    } catch (e) {
      setNotice(String(e));
    }
  }
  async function addNodeHost(hostname: string, from: string) {
    const h = await SavedHost(from).catch(() => null);
    const entry = hosts.find((x) => x.alias === from);
    setPreset({ label: hostname, address: hostname, user: h?.user ?? entry?.user ?? '', jump: h?.jump ?? '', group: entry?.group ?? '', key: h?.key ?? '' });
    setEditing(null);
  }
  function dropSession(sid: string) {
    if (retry.current[sid]) clearTimeout(retry.current[sid].timer);
    delete retry.current[sid];
    Disconnect(sid);
    unsub.current[sid]?.();
    delete unsub.current[sid];
    delete terms.current[sid];
    setBroadcast((b) => {
      const n = new Set(b);
      n.delete(sid);
      return n;
    });
  }
  async function closeTab(id: string) {
    const t = tabsRef.current.find((x) => x.id === id);
    if (!t) return;
    if (t.kind === 'editor' && t.dirty && !(await ask(`Close ${t.path.split('/').pop()} without saving?`, 'Close')).ok) return;
    if (t.kind === 'term' && settings?.confirmClose && t.sessions.some((s) => !s.closed) && !(await ask(`Close ${t.sessions.map((s) => s.alias).join(', ')}?`, 'Close', 'The session ends.')).ok) return;
    if (t.kind === 'term') t.sessions.forEach((s) => dropSession(s.sid));
    else delete editors.current[id];
    setTabs((ts) => {
      const i = ts.findIndex((x) => x.id === id);
      const next = ts.filter((x) => x.id !== id);
      if (activeRef.current === id) setActive(next[Math.min(i, next.length - 1)]?.id);
      return next;
    });
  }
  // ⌘W: close the focused pane; the tab goes when its last pane does
  async function closeFocused() {
    const t = tabsRef.current.find((x) => x.id === activeRef.current);
    if (!t) return;
    if (t.kind === 'editor' || t.sessions.length === 1) return closeTab(t.id);
    const s = t.sessions.find((x) => x.sid === t.focus)!;
    if (!s.closed && settings?.confirmClose && !(await ask(`Close pane ${s.alias}?`, 'Close')).ok) return;
    dropSession(s.sid);
    patchTab<TermTab>(t.id, (x) => {
      const rest = x.sessions.filter((y) => y.sid !== s.sid);
      return { sessions: rest, focus: rest[0].sid };
    });
  }

  // ---- session restore ----
  const checkedUpdate = useRef(false);
  useEffect(() => {
    if (!settings?.updateCheck || checkedUpdate.current) return;
    checkedUpdate.current = true;
    CheckUpdate()
      .then((u) => u.newer && toast({ text: `Spean ${u.latest} is available (you run ${u.current})`, sub: 'click to open the release', onClick: () => BrowserOpenURL(u.url) }, 15000))
      .catch(() => {});
  }, [settings?.updateCheck]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!settings || !loaded) return;
    if (settings.restore === 'no' || tabsRef.current.length) return;
    LastSession().then(async (last) => {
      const items = (last ?? []).filter((s) => s.local || hosts.some((h) => h.alias === s.alias));
      if (!items.length) return;
      let go = settings.restore === 'yes';
      if (!go) {
        const r = await ask(`Reopen ${items.length} tab${items.length > 1 ? 's' : ''} from last time?`, 'Reopen', items.map((s) => s.alias).join(', '), true);
        if (r.remember) saveSettings(new config.Settings({ ...settings, restore: r.ok ? 'yes' : 'no' }));
        go = r.ok;
      }
      if (go) items.forEach((s) => openTab(s.alias, !!s.local));
    });
  }, [loaded, settings?.restore]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setTimeout(() => {
      const items: main.SessionTab[] = tabs.flatMap((t) => (t.kind === 'term' ? t.sessions.map((s) => new main.SessionTab({ alias: s.alias, local: s.local })) : []));
      SaveSession(items);
    }, 500);
    return () => clearTimeout(t);
  }, [tabs]);
  useEffect(() => {
    const onUnload = () => tabs.forEach((t) => t.kind === 'term' && t.sessions.forEach((s) => Disconnect(s.sid)));
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [tabs]);

  // ---- keyboard ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target as HTMLElement)?.closest('.xterm, input, textarea, [role=dialog]')) return setRight(null);
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      const cur = tabsRef.current.find((t) => t.id === activeRef.current);
      const sid = cur?.kind === 'term' ? cur.focus : undefined;
      if (k === 'k') setSpotlight((v) => !v);
      else if (k === 'r' && sid) setHistOpen((v) => !v);
      else if (k === 'f' && e.shiftKey) setRight((r) => (r === 'files' ? null : 'files'));
      else if (k === 'b') setSidebar((m) => (m === 'full' ? 'icons' : m === 'icons' ? 'hidden' : 'full'));
      else if (k === ',') setSettingsOpen(true);
      else if (k === 'l') lockVault();
      else if (k === 'e') split('col');
      else if (k === 'd' && e.shiftKey) setRight((r) => (r === 'docker' ? null : 'docker'));
      else if (k === 'n' && e.shiftKey) setRight((r) => (r === 'notes' ? null : 'notes'));
      else if (k === 'p' && e.shiftKey) setRight((r) => (r === 'ports' ? null : 'ports'));
      else if (k === 'd') split('row');
      else if (k === 'f' && sid) terms.current[sid]?.search(true);
      else if (k === 's' && e.shiftKey) setStarSignal((n) => n + 1);
      else if (k === 's' && cur?.kind === 'editor') editors.current[cur.id]?.current?.save();
      else if (k === 'w' && cur) closeFocused();
      else if (/^[1-9]$/.test(e.key) && sid) {
        setHotkey(Number(e.key));
        setTimeout(() => setHotkey(0), 0);
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- derived ----
  useEffect(() => {
    const t = tabsRef.current.find((x) => x.id === active);
    if (t?.kind === 'term' && t.sessions.some((s) => s.activity)) patchTab<TermTab>(t.id, (x) => ({ sessions: x.sessions.map((s) => ({ ...s, activity: undefined })) }));
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = tabs.find((t) => t.id === active);
  const curTab = cur?.kind === 'term' ? cur : undefined;
  const curS = curTab?.sessions.find((s) => s.sid === curTab.focus);
  const allS = tabs.flatMap((t) => (t.kind === 'term' ? t.sessions : []));
  sessionsRef.current = allS;
  const live = allS.filter((s) => !s.closed && s.status !== 'connecting');
  const labels = Object.fromEntries(allS.map((s) => [s.sid, s.alias]));
  const statusLine = curS ? curS.status || curS.hops.map((h) => `${h.alias} ${glyph[h.status]}`).join('  →  ') : '';
  const run = (sid: string, text: string, enter = true) => {
    const ok = terms.current[sid]?.run(text, enter) ?? false;
    const s = allS.find((x) => x.sid === sid);
    if (ok && enter && s && !s.local) HistoryAdd(s.alias, '', text, 0); // ⌘R: what Spean typed; nothing reads the server's history
    return ok;
  };
  const saveFavs = (alias: string, f: Fav[]) => {
    setFavs((m) => ({ ...m, [alias]: f }));
    SetFavorites(alias, f);
  };
  const saveSnippets = (s: Fav[]) => {
    setSnippetsState(s);
    SetSnippets(s);
  };
  const hostStatus: Record<string, HostStatus> = {};
  for (const s of allS) {
    const st: HostStatus = s.closed ? (s.status && s.status !== 'disconnected' ? 'error' : undefined) : s.status === 'connecting' ? 'connecting' : 'connected';
    if (st && hostStatus[s.alias] !== 'connected') hostStatus[s.alias] = st;
  }
  const dockerOn: Record<string, boolean> = {};
  for (const f of fwds) if (f.active && f.kind === 'docker') dockerOn[labels[f.tabId] ?? ''] = true;
  const clusters = Object.fromEntries(Object.entries(groups).map(([g, m]) => [g, m.kind === 'swarm']));

  // Type a command into a live tab for alias, opening one if needed (used by cluster actions).
  function runOnHost(alias: string, cmd: string) {
    const s = live.find((x) => x.alias === alias);
    if (s) {
      if (!run(s.sid, cmd)) setNotice(`${alias}: tab closed`);
      return;
    }
    const sess = newSession(alias, false);
    const id = String(nextId++);
    setTabs((ts) => [...ts, { kind: 'term', id, sessions: [sess], dir: 'row', focus: sess.sid }]);
    setActive(id);
    pendingCmd.current[sess.sid] = cmd;
  }
  const onInput = (sid: string, d: string) => {
    const b = broadcastRef.current;
    if (b.has(sid)) b.forEach((o) => o !== sid && Write(o, d));
  };
  async function toggleLog(s: Session) {
    if (s.log) {
      await LogStop(s.sid);
      patchSession(s.sid, () => ({ log: undefined }));
      setNotice('log stopped');
    } else {
      const p = await LogStart(s.sid).catch(String);
      patchSession(s.sid, () => ({ log: p }));
      setNotice(`logging to ${p}`);
    }
  }

  const extras: Extra[] = [
    ...(curS && !curS.closed && !curS.local
      ? [
          { id: 'fwd', title: `Forward port on ${curS.alias}…`, sub: '-L, -R or SOCKS through this host', run: () => setFwdFor({ id: curS.sid, label: curS.alias }) },
          { id: 'files', title: `Open files for ${curS.alias}`, sub: `${MOD}⇧F`, run: () => setRight('files') },
          { id: 'log', title: `${curS.log ? 'Stop logging' : 'Log to file'} · ${curS.alias}`, sub: curS.log ?? 'timestamped, under the data dir', run: () => toggleLog(curS) },
          { id: 'split', title: 'Split pane', sub: `${MOD}D right · ${MOD}E below`, run: () => split('row') },
          { id: 'docker', title: `${right === 'docker' ? 'Close' : 'Open'} Docker panel on ${curS.alias}`, sub: `${MOD}⇧D`, run: () => setRight((r) => (r === 'docker' ? null : 'docker')) },
          { id: 'shell', title: `Container shell on ${curS.alias}…`, sub: 'Docker panel → Containers → right-click', run: () => setRight('docker') },
          { id: 'notes', title: `Notes for ${curS.alias}`, sub: `${MOD}⇧N · saved as you type`, run: () => setRight('notes') },
          { id: 'ports', title: `Ports on ${curS.alias}`, sub: `${MOD}⇧P · what is listening, forward with one click`, run: () => setRight('ports') },
          ...(favs[curS.alias] ?? []).map((f, i) => ({
            id: `fav${i}`,
            title: `Run ${f.name} on ${curS.alias}`,
            sub: f.cmd,
            section: 'Favorites',
            run: () => {
              setHotkey(i + 1);
              setTimeout(() => setHotkey(0), 0);
            },
          })),
          ...snippets.map((f, i) => ({ id: `snip${i}`, title: `Run snippet ${f.name} on ${curS.alias}`, sub: f.cmd, section: 'Favorites', run: () => run(curS.sid, f.cmd, f.run) })),
        ]
      : []),
    { id: 'multi', title: 'Run command on many hosts…', sub: 'multi-exec', run: () => setMulti({ cmd: '' }) },
    { id: 'keys', title: 'Keys · copy public key to a host', sub: 'key manager', run: () => setKeysOpen({}) },
    { id: 'lock', title: vault.locked ? 'Unlock vault' : 'Lock vault', sub: `${MOD}L`, run: () => (vault.locked ? needVault() : lockVault()) },
    ...(os !== 'windows' ? [{ id: 'local', title: 'Open local terminal', sub: '$SHELL on this machine', run: () => openTab('local', true) }] : []),
    { id: 'bcast', title: broadcast.size ? 'Stop broadcast input' : 'Broadcast input to all panes of this tab', sub: 'keystrokes go to every selected pane', run: () => toggleBroadcast() },
    { id: 'sidebar', title: 'Cycle sidebar (full → icons → hidden)', sub: `${MOD}B`, run: () => setSidebar((m) => (m === 'full' ? 'icons' : m === 'icons' ? 'hidden' : 'full')) },
    { id: 'hist', title: 'Command history across hosts', sub: `${MOD}R`, run: () => setHistOpen(true) },
    { id: 'runbooks', title: curS && !curS.local ? `Runbooks · run on ${curS.alias}` : 'Runbooks', sub: 'step-by-step command sequences with checkpoints', run: () => setRunbooks(true) },
    { id: 'sshcfg', title: 'Edit ~/.ssh/config', sub: 'local editor tab; the host list refreshes on save', run: () => openEditor('local', '~/.ssh/config') },
    { id: 'kh', title: 'Edit ~/.ssh/known_hosts', sub: 'remove a changed key line here', run: () => openEditor('local', '~/.ssh/known_hosts') },
    { id: 'export', title: 'Export everything…', sub: 'hosts, settings, encrypted vault → one JSON', run: () => setSettingsOpen(true) },
  ];
  // Open the file browser on the pane for sid at path (from a terminal selection).
  function openFilesAt(sid: string, path: string) {
    setRight('files');
    setGoto({ sid, path, n: Date.now() });
  }
  const light = !!(settings && themes[settings.theme]?.light);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', !light); // portals (dialogs, menus) live outside the root div
  }, [light]);
  const topPad = mac ? 28 : 0; // traffic lights sit in the first 28 px of the sidebar / tab bar
  function toggleBroadcast() {
    if (broadcast.size) return setBroadcast(new Set());
    if (curTab) setBroadcast(new Set(curTab.sessions.filter((s) => !s.closed).map((s) => s.sid)));
  }

  const termFor = (s: Session, tab: TermTab) => (
    <div
      key={s.sid}
      className={`relative flex min-h-0 min-w-0 flex-1 flex-col ${tab.sessions.length > 1 && tab.focus === s.sid ? 'ring-1 ring-inset ring-sky-500/40' : ''}`}
      onMouseDown={() => tab.focus !== s.sid && patchTab<TermTab>(tab.id, () => ({ focus: s.sid }))}
    >
      {tab.sessions.length > 1 && (
        <div className="flex h-5 items-center gap-2 px-2 text-[10px] text-muted-foreground">
          <span className="truncate">{s.alias}</span>
          <Label className="ml-auto flex items-center gap-1">
            <Checkbox
              className="size-3"
              checked={broadcast.has(s.sid)}
              onCheckedChange={(c) =>
                setBroadcast((b) => {
                  const n = new Set(b);
                  if (c) n.add(s.sid);
                  else n.delete(s.sid);
                  return n;
                })
              }
            />
            broadcast
          </Label>
        </div>
      )}
      {s.closed && s.status && s.status !== 'disconnected' && (
        <div className="absolute inset-x-0 top-8 z-10 mx-auto w-[28rem] max-w-[90%] rounded-xl bg-popover p-4 text-sm ring-1 ring-foreground/10">
          <p className="font-medium">Could not connect to {s.alias}</p>
          <p className="mt-1 text-xs text-muted-foreground">{s.status}</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => connect(s.sid, s.alias, s.local)}>
              Retry
            </Button>
            {hosts.find((h) => h.alias === s.alias)?.saved && (
              <Button size="sm" variant="outline" onClick={() => setEditing(s.alias)}>
                Edit host · Test connection
              </Button>
            )}
          </div>
        </div>
      )}
      {s.status === 'connecting' && !s.closed && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3">
          <JellyLoader />
          <p className="text-xs text-neutral-400">{s.hops.map((h) => `${h.alias} ${glyph[h.status]}`).join('  →  ') || s.alias}</p>
        </div>
      )}
      <Term
        id={s.sid}
        ref={(h) => {
          terms.current[s.sid] = h;
        }}
        hidden={tab.id !== active}
        themeName={hosts.find((h) => h.alias === s.alias)?.theme || undefined}
        closed={s.closed}
        onEnterWhenClosed={() => connect(s.sid, s.alias, s.local)}
        onInput={(d) => onInput(s.sid, d)}
        onSelectionMenu={(text, x, y) => setSelMenu({ sid: s.sid, text, x, y })}
        onActivity={(kind) => {
          const t = tabsRef.current.find((x) => x.kind === 'term' && x.sessions.some((y) => y.sid === s.sid));
          if (t && t.id !== activeRef.current) patchSession(s.sid, (x) => (x.activity === 'bell' ? {} : { activity: kind }));
        }}
        onPaste={(text) => ask(`Paste ${text.split('\n').length} lines?`, 'Paste', 'Each line runs as soon as the shell sees it.').then((r) => r.ok)}
      />
    </div>
  );

  return (
    <div className="grid h-screen grid-cols-[auto_1fr_auto] grid-rows-[minmax(0,1fr)] bg-background text-foreground text-sm">
      {sidebar !== 'hidden' ? (
      <HostList
        mode={sidebar}
        topPad={topPad}
        hosts={hosts}
        status={hostStatus}
        onConnect={(a) => openTab(a)}
        onEdit={setEditing}
        onRefresh={refresh}
        onInstallKey={() => setKeysOpen({})}
        onManageKeys={() => setKeysOpen({})}
        onLocal={os === 'windows' ? undefined : () => openTab('local', true)}
        docker={dockerOn}
        onDocker={async (alias, what) => {
          if (what === 'host') {
            const line = `export DOCKER_HOST=${await DockerHost(alias)}`;
            await ClipboardSetText(line);
            setNotice(`copied: ${line}`);
          } else setNotice(await DockerContextCreate(alias).catch(String));
        }}
        clusters={clusters}
        onCluster={setCluster}
        onMulti={(aliases) => setMulti({ aliases })}
      />
      ) : (
        <div />
      )}

      <main className="flex min-w-0 flex-col">
        <div
          className="flex h-9 items-stretch bg-sidebar/60 ring-1 ring-white/10"
          style={{ paddingLeft: !mac || sidebar === 'full' ? 0 : sidebar === 'hidden' ? 78 : 30, '--wails-draggable': 'drag' } as React.CSSProperties}
        >
          <MagnetTabs
            tabs={tabs.map((t) => ({
              id: t.id,
              label:
                t.kind === 'term'
                  ? t.sessions.map((s) => s.title ?? s.alias).join(' | ')
                  : `${t.path.split('/').pop()} · ${t.src === 'local' ? 'local' : labels[t.src] ?? t.src}${t.dirty ? ' •' : ''}`,
              closed: t.kind === 'term' && t.sessions.every((s) => s.closed),
              activity: t.kind === 'term' ? (t.sessions.some((s) => s.activity === 'bell') ? 'bell' : t.sessions.some((s) => s.activity) ? 'output' : undefined) : undefined,
            }))}
            activeId={active}
            onSelect={setActive}
            onClose={closeTab}
          />
          <div className="flex items-stretch" style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}>
          {curTab && (
            <>
              <Button size="icon-sm" variant="ghost" title={`Split right (${MOD}D)`} className="m-0.5" onClick={() => split('row')}>
                <SplitSquareHorizontal />
              </Button>
              <Button size="icon-sm" variant="ghost" title={`Split below (${MOD}E)`} className="m-0.5" onClick={() => split('col')}>
                <SplitSquareVertical />
              </Button>
              <Button size="icon-sm" variant="ghost" title="Broadcast input" className={`m-0.5 ${broadcast.size ? 'text-amber-400' : ''}`} onClick={toggleBroadcast}>
                <Radio />
              </Button>
              {curS?.title && !curS.closed && (
                <>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    title={curS.paused ? 'Resume output' : 'Pause output (stream keeps running)'}
                    className={`m-0.5 ${curS.paused ? 'text-amber-400' : ''}`}
                    onClick={() => {
                      terms.current[curS.sid]?.pause(!curS.paused);
                      patchSession(curS.sid, (x) => ({ paused: !x.paused }));
                    }}
                  >
                    {curS.paused ? <Play /> : <Pause />}
                  </Button>
                  <Button size="icon-sm" variant="ghost" title="Clear buffer" className="m-0.5" onClick={() => terms.current[curS.sid]?.clear()}>
                    <Eraser />
                  </Button>
                </>
              )}
              {curS && !curS.closed && (
                <Button size="icon-sm" variant="ghost" title={curS.log ? `Logging to ${curS.log} (click to stop)` : 'Log to file'} className={`m-0.5 ${curS.log ? 'text-emerald-400' : ''}`} onClick={() => toggleLog(curS)}>
                  <FileText />
                </Button>
              )}
            </>
          )}
          {(notice || (curS?.status === 'connecting' && !curS.closed)) && (
            <span className="m-1 max-w-72 truncate self-center rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground" title={notice || statusLine}>
              {notice || statusLine}
            </span>
          )}
          <Button size="icon-sm" variant="ghost" title={`Files (${MOD}⇧F)`} className={`m-0.5 ${right === 'files' ? 'bg-accent' : ''}`} onClick={() => setRight((r) => (r === 'files' ? null : 'files'))}>
            <FolderOpen />
          </Button>
          {curS && !curS.local && (
            <Button size="icon-sm" variant="ghost" title={`Docker (${MOD}⇧D)`} className={`m-0.5 ${right === 'docker' ? 'bg-accent' : ''}`} onClick={() => setRight((r) => (r === 'docker' ? null : 'docker'))}>
              <Container />
            </Button>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            title={vault.locked ? (vault.exists ? 'Vault locked — click to unlock' : 'No vault yet — created when you first choose Remember') : `Vault unlocked (${MOD}L locks)`}
            className={`m-0.5 ${vault.locked ? 'text-muted-foreground' : 'text-emerald-400'}`}
            onClick={() => (vault.locked ? needVault() : lockVault())}
          >
            {vault.locked ? <Lock /> : <LockOpen />}
          </Button>
          <Button size="icon-sm" variant="ghost" title={`Settings (${MOD},)`} className="m-0.5" onClick={() => setSettingsOpen(true)}>
            <Settings2 />
          </Button>
          </div>
        </div>
        {broadcast.size > 0 && (
          <div className="flex h-5 items-center justify-center bg-amber-500/20 text-[11px] text-amber-300">
            Broadcasting keystrokes to {broadcast.size} panes — click the radio icon to stop
          </div>
        )}
        {curS && !curS.closed && !curS.local && (
          <FavoriteBar
            key={curS.sid}
            alias={curS.alias}
            tabId={curS.sid}
            term={terms.current[curS.sid]}
            favorites={favs[curS.alias] ?? []}
            onChange={(f) => saveFavs(curS.alias, f)}
            starSignal={starSignal}
            starText={starText}
            hotkey={hotkey}
            snippets={snippets}
            onSnippets={saveSnippets}
            onMany={(cmd) => setMulti({ cmd })}
          />
        )}
        {curS?.closed === false && curS.status !== 'connecting' && curS.hops.length > 0 && (
          <div className="truncate px-3 py-0.5 text-[10px] text-muted-foreground">{statusLine}</div>
        )}
        <div className="flex min-h-0 flex-1">
          <div className="relative flex min-w-0 flex-1 flex-col">
            {tabs.length === 0 && <EmptyState onConnect={() => setSpotlight(true)} onAddHost={() => setEditing(null)} onLocal={os === 'windows' ? undefined : () => openTab('local', true)} />}
            {tabs.map((t) =>
              t.kind === 'term' ? (
                <div key={t.id} className={`min-h-0 flex-1 ${t.id === active ? 'flex' : 'hidden'}`}>
                  {t.sessions.length === 1 ? termFor(t.sessions[0], t) : <SplitView dir={t.dir}>{t.sessions.map((s) => termFor(s, t))}</SplitView>}
                </div>
              ) : (
                <Editor
                  key={t.id}
                  handle={editors.current[t.id]}
                  src={t.src}
                  path={t.path}
                  text={t.text}
                  hidden={t.id !== active}
                  onDirty={(dirty) => patchTab<EditorTab>(t.id, () => ({ dirty }))}
                  onSaved={() => t.src === 'local' && /\.ssh\/config$/.test(t.path) && refresh()}
                  run={t.src === 'local' ? undefined : (text, enter) => run(t.src, text, enter)}
                />
              ),
            )}
          </div>
        </div>
        <Drawer forwards={fwds} labels={labels} />
      </main>

      {right ? (
        <RightPane tab={right} onTab={setRight} onClose={() => setRight(null)} dockerAvailable={!!curS && !curS.closed && !curS.local} notesAvailable={!!curS && !curS.local}>
          {right === 'notes' && curS && !curS.local ? (
            <NotesPane key={curS.alias} alias={curS.alias} />
          ) : right === 'ports' && curS && !curS.closed && !curS.local ? (
            <PortsPane key={curS.sid} sid={curS.sid} alias={curS.alias} forwards={fwds} onNotice={setNotice} />
          ) : right === 'docker' && curS && !curS.closed && !curS.local ? (
            <DockerPanel
              key={curS.sid}
              sid={curS.sid}
              alias={curS.alias}
              nodes={groups[hosts.find((h) => h.alias === curS.alias)?.group ?? '']?.nodes ?? []}
              onClose={() => setRight(null)}
              run={(cmd) => run(curS.sid, cmd)}
              openCmd={openCmd}
              inspect={(title, json) => openEditor(curS.sid, title + '.json', json)}
              forward={(port) => forwardAndOpen(curS.sid, port)}
              addNode={(hostname) => addNodeHost(hostname, curS.alias)}
              onNotice={(text, sub, tone) => toast({ text, sub, tone }, 10000)}
            />
          ) : (
            <FileBrowser
              tabs={live.filter((s) => !s.local).map((s) => ({ id: s.sid, label: s.alias }))}
              active={curS && !curS.closed && !curS.local ? curS.sid : undefined}
              run={run}
              onOpen={openEditor}
              goto={goto}
            />
          )}
        </RightPane>
      ) : (
        <div />
      )}

      <HistoryPalette open={histOpen} host={curS && !curS.local ? curS.alias : undefined} onClose={() => setHistOpen(false)} onPick={(cmd, go) => curS && run(curS.sid, cmd, go)} />
      {selMenu && <SelectionMenu m={selMenu} onClose={() => setSelMenu(null)} onFiles={(p) => openFilesAt(selMenu.sid, p)} onForward={(port) => forwardAndOpen(selMenu.sid, port)} onStar={(cmd) => { setSelMenu(null); setStarText(cmd); setStarSignal((n) => n + 1); }} onPaste={(t) => Write(selMenu.sid, t)} />}
      <Runbooks open={runbooks} onClose={() => setRunbooks(false)} host={curS && !curS.closed && !curS.local ? curS.alias : undefined} term={curS ? terms.current[curS.sid] : null} />
      <Toasts items={toasts} onClose={(id) => setToasts((ts) => ts.filter((x) => x.id !== id))} />
      <Spotlight open={spotlight} hosts={hosts} extras={extras} onClose={() => setSpotlight(false)} onPick={(a) => openTab(a)} />
      <PromptDialog onRemember={remember} />
      <HostEditor
        open={editing !== undefined}
        label={editing ?? undefined}
        hosts={hosts}
        preset={preset}
        onClose={() => {
          setEditing(undefined);
          setPreset(undefined);
        }}
        onSaved={refresh}
        onManageKeys={() => setKeysOpen({})}
        onConnect={(a) => openTab(a)}
      />
      <KeyManager open={!!keysOpen} onClose={() => setKeysOpen(null)} tabs={live.filter((s) => !s.local).map((s) => ({ id: s.sid, label: s.alias }))} onNeedVault={needVault} onPick={keysOpen?.pick} />
      <VaultDialog mode={vaultMode} onDone={vaultDone} />
      <ForwardDialog tab={fwdFor} onClose={() => setFwdFor(null)} />
      <MultiExec open={multi} onClose={() => setMulti(null)} hosts={hosts} groups={groups} />
      {cluster && (
        <ClusterDialog
          group={cluster}
          meta={groups[cluster]}
          hosts={hosts}
          onClose={() => setCluster(null)}
          onChanged={refresh}
          onOpen={(a) => openTab(a)}
          onRunOnManager={async (g, cmd) => {
            const m = await ClusterManager(g);
            if (m) runOnHost(m, cmd);
            else setNotice('no manager mapped to a host yet');
          }}
        />
      )}
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} onImported={refresh} />
      {settings && !settings.onboarded && loaded && (
        <Onboarding
          open
          hosts={hosts}
          onDone={() => {
            saveSettings(new config.Settings({ ...settings, onboarded: true }));
            refresh();
          }}
          onAddHost={() => setEditing(null)}
        />
      )}
      <Dialog open={!!confirm} onOpenChange={(o) => !o && confirm?.resolve(false)}>
        <DialogContent className="sm:max-w-sm">
          {confirm && (
            <ConfirmBody c={confirm} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ConfirmBody({ c }: { c: { title: string; body?: string; ok: string; remember?: boolean; resolve(v: boolean, remember?: boolean): void } }) {
  const [rem, setRem] = useState(false);
  return (
    <>
      <DialogHeader>
        <DialogTitle>{c.title}</DialogTitle>
        {c.body && <DialogDescription>{c.body}</DialogDescription>}
      </DialogHeader>
      {c.remember && (
        <Label className="flex items-center gap-2 text-xs">
          <Checkbox checked={rem} onCheckedChange={(v) => setRem(!!v)} /> Remember my answer
        </Label>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={() => c.resolve(false, rem)}>
          Cancel
        </Button>
        <Button autoFocus onClick={() => c.resolve(true, rem)}>
          {c.ok}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Right-click on selected terminal text: what can we do with it? */
function SelectionMenu({
  m,
  onClose,
  onFiles,
  onForward,
  onStar,
  onPaste,
}: {
  m: { sid: string; text: string; x: number; y: number };
  onClose(): void;
  onFiles(path: string): void;
  onForward(port: number): void;
  onStar(cmd: string): void;
  onPaste(text: string): void;
}) {
  const t = m.text.trim();
  const path = /^(\/|~\/)[^\s'"]*$/.test(t) ? t : null;
  const port = /^(?:[\w.-]+)?:(\d{2,5})$/.exec(t)?.[1] ?? (/^\d{2,5}$/.test(t) ? t : null);
  const url = /^https?:\/\/\S+$/.test(t) ? t : null;
  useEffect(() => {
    const off = () => onClose();
    window.addEventListener('mousedown', off);
    window.addEventListener('keydown', off);
    return () => {
      window.removeEventListener('mousedown', off);
      window.removeEventListener('keydown', off);
    };
  }, [onClose]);
  const Item = ({ label, onClick }: { label: string; onClick(): void }) => (
    <button
      type="button"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={() => {
        onClick();
        onClose();
      }}
      className="block w-full rounded-md px-2 py-1 text-left text-xs hover:bg-accent"
    >
      {label}
    </button>
  );
  return (
    <div className="fixed z-50 min-w-44 rounded-lg bg-popover p-1 ring-1 ring-white/10" style={{ left: m.x, top: m.y }}>
      <Item label="Copy" onClick={() => ClipboardSetText(m.text)} />
      <Item label="Paste selection" onClick={() => onPaste(m.text)} />
      {path && <Item label={`Open ${path.length > 30 ? '…' + path.slice(-28) : path} in Files`} onClick={() => onFiles(path)} />}
      {port && <Item label={`Forward port ${port} & open`} onClick={() => onForward(Number(port))} />}
      {url && <Item label="Open URL" onClick={() => BrowserOpenURL(url)} />}
      {!t.includes('\n') && t.length < 200 && <Item label="Star as favorite…" onClick={() => onStar(t)} />}
    </div>
  );
}
