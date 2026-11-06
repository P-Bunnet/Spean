import { useCallback, useEffect, useRef, useState } from 'react';
import { MOD } from '@/lib/keys';
import { ArrowLeft, ArrowRight, ArrowUp, Download, Eye, EyeOff, FolderPlus, Pencil, RefreshCw, Search, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Chmod, CountTree, DeleteTree, DiskUsage, Download as DownloadTo, List, Mkdir, ReadPreview, Rename, SearchFiles, UploadPick } from '../../wailsjs/go/main/App';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ClipboardSetText } from '../../wailsjs/runtime/runtime';
import type { main } from '../../wailsjs/go/models';

const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} K` : `${(n / 1048576).toFixed(1)} M`);
const fmtTime = (unix: number) => {
  const d = new Date(unix * 1000);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return sameYear ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString();
};
// single-quote for sh: ' → '\''
const q = (p: string) => `'${p.replace(/'/g, `'\\''`)}'`;
const parent = (p: string) => p.replace(/\/[^/]*$/, '') || '/';
export const DRAG_MIME = 'application/x-spean-files';

type SortKey = 'name' | 'size' | 'mtime' | 'mode';
type Edit = { kind: 'rename'; from: string; value: string } | { kind: 'mkdir'; value: string };
export type Source = { id: string; label: string }; // 'local' or a connected tab id
export type Drag = { src: string; paths: string[] };

type Props = {
  src: string;
  sources: Source[];
  onSrc(id: string): void;
  run?(text: string, enter?: boolean): boolean; // remote panes: type into the shell
  onDrop(from: Drag, toDir: string, move: boolean): void;
  onOpen(path: string): void; // double-click a file → editor tab
  jumpTo?: { path: string; n: number }; // navigate here (a file path lands on its folder)
  clipboard: React.RefObject<Drag | null>; // ⌘C / ⌘V across panes
};

export function Pane({ src, sources, onSrc, run, onDrop, onOpen, jumpTo, clipboard }: Props) {
  const [path, setPath] = useState('');
  const [entries, setEntries] = useState<main.FileEntry[]>([]);
  const [msg, setMsg] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchor = useRef<string>(undefined);
  const [showHidden, setShowHidden] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'name', asc: true });
  const [editPath, setEditPath] = useState(false);
  const [pathDraft, setPathDraft] = useState('');
  const [edit, setEdit] = useState<Edit | null>(null);
  const [ctx, setCtx] = useState<main.FileEntry | null>(null); // row under the context menu; null = background
  const [confirmDel, setConfirmDel] = useState<{ names: string[]; files: number; dirs: number; bytes: number } | null>(null);
  const [chmod, setChmod] = useState<{ name: string; mode: string } | null>(null);
  const [search, setSearch] = useState<string | null>(null); // null = off
  const [hits, setHits] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ name: string; p: main.Preview } | null>(null);
  const [disk, setDisk] = useState<main.Disk | null>(null);
  const [over, setOver] = useState<string | null>(null); // drop target highlight: '' = background, else dir name
  const hist = useRef<{ back: string[]; fwd: string[] }>({ back: [], fwd: [] });
  const pathRef = useRef('');
  pathRef.current = path;
  const remote = src !== 'local';

  const load = useCallback(
    async (dir: string, push = true) => {
      setMsg('');
      try {
        const l = await List(src, dir);
        if (push && pathRef.current && l.path !== pathRef.current) {
          hist.current.back.push(pathRef.current);
          hist.current.fwd = [];
        }
        setPath(l.path);
        setEntries(l.entries ?? []);
        setSelected(new Set());
        setEdit(null);
        return l.path;
      } catch (e) {
        setMsg(String(e));
      }
    },
    [src],
  );
  useEffect(() => {
    hist.current = { back: [], fwd: [] };
    pathRef.current = '';
    load('');
  }, [load]);

  useEffect(() => {
    if (!jumpTo) return;
    const p = jumpTo.path.replace(/^~/, ''); // List('') resolves home; ~/x → /x relative to home is wrong, so go via home
    const target = jumpTo.path.startsWith('~') ? '' : p;
    load(target).then((r) => {
      if (!r) load(parent(p)); // it was a file, or missing: show the folder
      else if (jumpTo.path.startsWith('~') && p) load(r.replace(/\/$/, '') + p);
    });
  }, [jumpTo, load]);

  const go = (dir: string, push = true) => load(dir, push); // panel and shell move independently: no hook in the remote shell
  const back = () => {
    const p = hist.current.back.pop();
    if (p) {
      hist.current.fwd.push(path);
      go(p, false);
    }
  };
  const fwd = () => {
    const p = hist.current.fwd.pop();
    if (p) {
      hist.current.back.push(path);
      go(p, false);
    }
  };

  async function act(fn: () => Promise<unknown>, busy: string) {
    setMsg(busy);
    try {
      await fn();
      await load(path, false);
    } catch (e) {
      setMsg(String(e));
    }
  }

  const join = (name: string) => (path.endsWith('/') ? path + name : `${path}/${name}`);
  const selPaths = () => [...selected].map(join);
  const one = selected.size === 1 ? entries.find((e) => selected.has(e.name)) : undefined;

  function select(e: main.FileEntry, ev: React.MouseEvent) {
    const next = new Set(ev.metaKey || ev.ctrlKey ? selected : []);
    if (ev.shiftKey && anchor.current) {
      const names = rows.map((r) => r.name);
      const [a, b] = [names.indexOf(anchor.current), names.indexOf(e.name)].sort((x, y) => x - y);
      names.slice(a, b + 1).forEach((n) => next.add(n));
    } else {
      if (next.has(e.name) && (ev.metaKey || ev.ctrlKey)) next.delete(e.name);
      else next.add(e.name);
      anchor.current = e.name;
    }
    setSelected(next);
  }

  function commitEdit() {
    if (!edit) return;
    const name = edit.value.trim();
    if (!name || name.includes('/')) return setEdit(null);
    if (edit.kind === 'mkdir') act(() => Mkdir(src, join(name)), 'creating…');
    else if (name !== edit.from) act(() => Rename(src, join(edit.from), join(name)), 'renaming…');
    else setEdit(null);
  }

  // Delete: count first so the confirm can say "3 folders, 41 files, 12 MB"; then recursive.
  async function askDelete(names: string[]) {
    let files = 0, dirs = 0, bytes = 0;
    for (const n of names) {
      const c = await CountTree(src, join(n)).catch(() => null);
      if (c) {
        files += c.files;
        dirs += c.dirs;
        bytes += c.bytes;
      }
    }
    setConfirmDel({ names, files, dirs, bytes });
  }
  async function del(names: string[]) {
    for (const n of names) await DeleteTree(src, join(n));
  }
  // ⌘F: name search under the current folder (find on remote, walk on local)
  useEffect(() => {
    if (search === null) return;
    const t = setTimeout(() => SearchFiles(src, path, search, 200).then((r) => setHits(r ?? [])).catch((e) => setMsg(String(e))), 250);
    return () => clearTimeout(t);
  }, [search, src, path]);
  useEffect(() => {
    if (!path) return;
    const t = setTimeout(() => DiskUsage(src, path).then(setDisk).catch(() => setDisk(null)), 300);
    return () => clearTimeout(t);
  }, [src, path]);
  async function quickLook(name: string) {
    setMsg('loading preview…');
    try {
      setPreview({ name, p: await ReadPreview(src, join(name)) });
      setMsg('');
    } catch (e) {
      setMsg(String(e));
    }
  }
  const modeOctal = (m: string) => {
    // "-rwxr-xr--" → "754"
    const bits = m.slice(-9);
    if (bits.length !== 9) return '644';
    let out = '';
    for (let i = 0; i < 9; i += 3) out += String((bits[i] !== '-' ? 4 : 0) + (bits[i + 1] !== '-' ? 2 : 0) + (bits[i + 2] !== '-' ? 1 : 0));
    return out;
  };

  // ---- drag and drop between panes ----
  function dragStart(e: main.FileEntry, ev: React.DragEvent) {
    const paths = selected.has(e.name) ? selPaths() : [join(e.name)];
    ev.dataTransfer.setData(DRAG_MIME, JSON.stringify({ src, paths } satisfies Drag));
    ev.dataTransfer.effectAllowed = 'copyMove';
    const ghost = document.createElement('div');
    ghost.textContent = paths.length === 1 ? e.name : `${paths.length} items`;
    ghost.className = 'fixed -left-[9999px] rounded bg-sky-600 px-2 py-1 text-xs text-white';
    document.body.appendChild(ghost);
    ev.dataTransfer.setDragImage(ghost, 8, 8);
    setTimeout(() => ghost.remove(), 0);
  }
  const dragOver = (target: string) => (ev: React.DragEvent) => {
    if (!ev.dataTransfer.types.includes(DRAG_MIME)) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.dataTransfer.dropEffect = ev.metaKey || ev.ctrlKey ? 'move' : 'copy';
    if (over !== target) setOver(target);
  };
  const drop = (target: string) => (ev: React.DragEvent) => {
    setOver(null);
    const raw = ev.dataTransfer.getData(DRAG_MIME);
    if (!raw) return;
    ev.preventDefault();
    ev.stopPropagation();
    const from: Drag = JSON.parse(raw);
    const toDir = target ? join(target) : path;
    if (from.src === src && from.paths.some((p) => parent(p) === toDir)) return; // same folder: no-op
    onDrop(from, toDir, ev.metaKey || ev.ctrlKey);
  };

  function onKey(ev: React.KeyboardEvent) {
    if (edit || editPath) return;
    const mod = ev.metaKey || ev.ctrlKey;
    if (mod && ev.key === 'c' && selected.size) clipboard.current = { src, paths: selPaths() };
    else if (mod && ev.key === 'v' && clipboard.current) onDrop(clipboard.current, path, false);
    else if (mod && ev.key === 'a') setSelected(new Set(rows.map((r) => r.name)));
    else if (ev.key === 'Backspace' && mod && selected.size) askDelete([...selected]);
    else if (mod && ev.key === 'f') setSearch((v) => (v === null ? '' : null));
    else if (ev.key === ' ' && one && !one.isDir) quickLook(one.name);
    else if (ev.key === 'Escape' && search !== null) setSearch(null);
    else if (ev.key === 'Enter' && one && one.isDir) go(join(one.name));
    else if (ev.key === 'Enter' && one) onOpen(join(one.name));
    else return;
    ev.preventDefault();
    ev.stopPropagation(); // keep ⌘F here, not the terminal's find bar
  }

  const dir = sort.asc ? 1 : -1;
  const rows = entries
    .filter((e) => showHidden || !e.name.startsWith('.'))
    .sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      const k = sort.key;
      const c = k === 'name' || k === 'mode' ? a[k].localeCompare(b[k]) : a[k] - b[k];
      return c * dir;
    });
  const segs = path.split('/').filter(Boolean);
  const copy = (s: string) => ClipboardSetText(s).then(() => setMsg('copied'));
  const paste = (s: string) => {
    if (!run?.(`${q(s)} `, false)) setMsg('tab closed');
  };
  const download = (paths: string[]) => act(() => DownloadTo(src, paths), 'choose a folder…');

  const header = (k: SortKey, label: string, className = '') => (
    <button
      type="button"
      onClick={() => setSort((s) => ({ key: k, asc: s.key === k ? !s.asc : true }))}
      className={`text-left text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground ${className}`}
    >
      {label}
      {sort.key === k ? (sort.asc ? ' ↑' : ' ↓') : ''}
    </button>
  );

  return (
    <div
      data-pane={src}
      data-path={path}
      data-drop="pane"
      tabIndex={0}
      onKeyDown={onKey}
      onDragOver={dragOver('')}
      onDragLeave={() => setOver(null)}
      onDrop={drop('')}
      className={`flex min-w-0 flex-1 flex-col outline-none @container ${over === '' ? 'ring-1 ring-inset ring-brand' : ''}`}
      style={{ '--wails-drop-target': 'drop' } as React.CSSProperties}
    >
      <div className="flex items-center gap-0.5 border-b p-1.5">
        <select
          value={src}
          onChange={(e) => onSrc(e.target.value)}
          className="h-6 max-w-28 rounded border-none bg-muted px-1 text-xs"
          title="Pane source"
        >
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <Button size="icon-xs" variant="ghost" title="Back" className="hidden @[24rem]:inline-flex" disabled={!hist.current.back.length} onClick={back}>
          <ArrowLeft />
        </Button>
        <Button size="icon-xs" variant="ghost" title="Forward" className="hidden @[24rem]:inline-flex" disabled={!hist.current.fwd.length} onClick={fwd}>
          <ArrowRight />
        </Button>
        <Button size="icon-xs" variant="ghost" title="Up" onClick={() => go(parent(path))}>
          <ArrowUp />
        </Button>
        {editPath ? (
          <Input
            autoFocus
            value={pathDraft}
            onChange={(e) => setPathDraft(e.target.value)}
            onBlur={() => setEditPath(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setEditPath(false);
                go(pathDraft);
              }
              if (e.key === 'Escape') setEditPath(false);
            }}
            className="h-6 flex-1 font-mono text-xs"
            spellCheck={false}
          />
        ) : (
          <nav
            className="flex min-w-0 flex-1 items-center overflow-hidden whitespace-nowrap font-mono text-xs"
            onDoubleClick={() => {
              setPathDraft(path);
              setEditPath(true);
            }}
            title="double-click to type a path"
          >
            <button type="button" className="px-1 hover:text-sky-400" onClick={() => go('/')}>
              /
            </button>
            {segs.map((s, i) => (
              <span key={i} className="flex min-w-0 items-center">
                {i > 0 && <span className="text-muted-foreground">/</span>}
                <button
                  type="button"
                  className={`truncate px-0.5 hover:text-sky-400 ${i === segs.length - 1 ? '' : 'text-muted-foreground'}`}
                  onClick={() => go('/' + segs.slice(0, i + 1).join('/'))}
                >
                  {s}
                </button>
              </span>
            ))}
          </nav>
        )}
        <Button size="icon-xs" variant="ghost" title={`Search names here (${MOD}F)`} className={search !== null ? 'text-brand' : ''} onClick={() => setSearch((v) => (v === null ? '' : null))}>
          <Search />
        </Button>
        <Button size="icon-xs" variant="ghost" title="Refresh" onClick={() => load(path, false)}>
          <RefreshCw />
        </Button>
      </div>
      {search !== null && (
        <div className="flex items-center gap-1 border-b px-2 py-1">
          <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`find under ${path}`} className="h-6 font-mono text-xs" spellCheck={false} onKeyDown={(e) => e.key === 'Escape' && setSearch(null)} />
          <span className="shrink-0 text-[10px] text-muted-foreground">{hits.length}{hits.length >= 200 ? '+' : ''}</span>
        </div>
      )}

      <div className="grid grid-cols-[1fr_4rem] @[22rem]:grid-cols-[1fr_4rem_7rem] @[28rem]:grid-cols-[1fr_4rem_7rem_5.5rem] gap-2 border-b px-2 py-1">
        {header('name', 'Name')}
        {header('size', 'Size', 'text-right')}
        {header('mtime', 'Modified', 'hidden @[22rem]:block')}
        {header('mode', 'Mode', 'hidden @[28rem]:block')}
      </div>

      <ContextMenu onOpenChange={(o) => !o && setCtx(null)}>
        <ContextMenuTrigger className="flex min-h-0 flex-1 flex-col" onContextMenu={(e) => !(e.target as Element).closest('li') && setCtx(null)}>
          <ScrollArea className="flex-1">
            {search !== null && search && (
              <ul className="font-mono text-xs">
                {hits.map((hp) => (
                  <li
                    key={hp}
                    className="cursor-default truncate px-2 py-1 hover:bg-accent"
                    title={hp}
                    onClick={() => {
                      setSearch(null);
                      const dir = parent(hp);
                      load(dir).then(() => setSelected(new Set([hp.split('/').pop()!])));
                    }}
                    onDoubleClick={() => onOpen(hp)}
                  >
                    {hp.startsWith(path) ? hp.slice(path.length).replace(/^\//, '') : hp}
                  </li>
                ))}
                {!hits.length && <li className="px-2 py-1 text-muted-foreground">nothing found</li>}
              </ul>
            )}
            <ul className={`font-mono text-xs ${search ? 'hidden' : ''}`}>
              {edit?.kind === 'mkdir' && (
                <li className="px-2 py-0.5">
                  <EditInput edit={edit} setEdit={setEdit} commit={commitEdit} />
                </li>
              )}
              {rows.map((e) => (
                <li
                  key={e.name}
                  draggable
                  data-dir={e.isDir ? join(e.name) : undefined}
                  onDragStart={(ev) => dragStart(e, ev)}
                  onDragOver={e.isDir ? dragOver(e.name) : undefined}
                  onDrop={e.isDir ? drop(e.name) : undefined}
                  onClick={(ev) => select(e, ev)}
                  onDoubleClick={() => (e.isDir ? go(join(e.name)) : onOpen(join(e.name)))}
                  onContextMenu={() => {
                    setCtx(e);
                    if (!selected.has(e.name)) setSelected(new Set([e.name]));
                  }}
                  className={`grid cursor-default grid-cols-[1fr_4rem] @[22rem]:grid-cols-[1fr_4rem_7rem] @[28rem]:grid-cols-[1fr_4rem_7rem_5.5rem] items-center gap-2 px-2 py-1 hover:bg-accent ${
                    selected.has(e.name) ? 'bg-accent' : ''
                  } ${over === e.name ? 'ring-1 ring-inset ring-brand' : ''}`}
                >
                  {edit?.kind === 'rename' && edit.from === e.name ? (
                    <EditInput edit={edit} setEdit={setEdit} commit={commitEdit} />
                  ) : (
                    <span className={`truncate ${e.isDir ? 'text-sky-400' : ''}`}>
                      {e.name}
                      {e.isDir ? '/' : ''}
                    </span>
                  )}
                  <span className="text-right text-muted-foreground">{e.isDir ? '' : fmtSize(e.size)}</span>
                  <span className="hidden truncate text-muted-foreground @[22rem]:block">{fmtTime(e.mtime)}</span>
                  <span className="hidden truncate text-[10px] text-muted-foreground @[28rem]:block">{e.mode}</span>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </ContextMenuTrigger>
        <ContextMenuContent className="text-xs">
          {ctx && (
            <>
              {ctx.isDir ? (
                <ContextMenuItem onClick={() => go(join(ctx.name))}>Open</ContextMenuItem>
              ) : (
                <ContextMenuItem onClick={() => onOpen(join(ctx.name))}>Edit</ContextMenuItem>
              )}
              {remote && <ContextMenuItem onClick={() => download(selPaths())}>Download…</ContextMenuItem>}
              <ContextMenuItem onClick={() => setEdit({ kind: 'rename', from: ctx.name, value: ctx.name })}>Rename</ContextMenuItem>
              {!ctx.isDir && <ContextMenuItem onClick={() => quickLook(ctx.name)}>Quick look (Space)</ContextMenuItem>}
              <ContextMenuItem onClick={() => setChmod({ name: ctx.name, mode: modeOctal(ctx.mode) })}>Permissions…</ContextMenuItem>
              <ContextMenuItem variant="destructive" onClick={() => askDelete([...selected])}>
                Delete {selected.size > 1 ? `${selected.size} items` : ''}…
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => copy(join(ctx.name))}>Copy path</ContextMenuItem>
              {remote && <ContextMenuItem onClick={() => paste(join(ctx.name))}>Paste path into shell</ContextMenuItem>}
              <ContextMenuItem onClick={() => (clipboard.current = { src, paths: selPaths() })}>Copy ({MOD}C)</ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}
          {clipboard.current && <ContextMenuItem onClick={() => onDrop(clipboard.current!, path, false)}>Paste here ({MOD}V)</ContextMenuItem>}
          <ContextMenuItem onClick={() => setEdit({ kind: 'mkdir', value: '' })}>New folder</ContextMenuItem>
          {remote && <ContextMenuItem onClick={() => act(() => UploadPick(src, path), 'uploading…')}>Upload files…</ContextMenuItem>}
          {!ctx && <ContextMenuItem onClick={() => copy(path)}>Copy path</ContextMenuItem>}
          <ContextMenuItem onClick={() => setShowHidden((v) => !v)}>{showHidden ? 'Hide' : 'Show'} hidden files</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <div className="flex items-center gap-1 border-t p-1.5">
        {remote && (
          <>
            <Button size="icon-xs" variant="ghost" title="Upload files" onClick={() => act(() => UploadPick(src, path), 'uploading…')}>
              <Upload />
            </Button>
            <Button size="icon-xs" variant="ghost" title="Download" disabled={!selected.size} onClick={() => download(selPaths())}>
              <Download />
            </Button>
          </>
        )}
        <Button size="icon-xs" variant="ghost" title="New folder" onClick={() => setEdit({ kind: 'mkdir', value: '' })}>
          <FolderPlus />
        </Button>
        <Button size="icon-xs" variant="ghost" title="Rename" disabled={!one} onClick={() => setEdit({ kind: 'rename', from: one!.name, value: one!.name })}>
          <Pencil />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          title="Delete…"
          disabled={!selected.size}
          className="text-destructive"
          onClick={() => askDelete([...selected])}
        >
          <Trash2 />
        </Button>
        <Button size="icon-xs" variant="ghost" title={showHidden ? 'Hide hidden files' : 'Show hidden files'} onClick={() => setShowHidden((v) => !v)}>
          {showHidden ? <EyeOff /> : <Eye />}
        </Button>
        <span className="ml-1 flex-1 truncate text-[11px] text-muted-foreground">
          {msg || `drag here · ${MOD}-drag moves`}
        </span>
        {disk && disk.total > 0 && (
          <span className="shrink-0 text-[10px] text-muted-foreground" title={`${disk.mount}: ${fmtSize(disk.used)} used of ${fmtSize(disk.total)}`}>
            <span className={`mr-1 inline-block h-1.5 w-12 rounded bg-muted align-middle`}>
              <span className={`block h-1.5 rounded ${disk.used / disk.total > 0.9 ? 'bg-red-400' : disk.used / disk.total > 0.75 ? 'bg-amber-400' : 'bg-brand'}`} style={{ width: `${Math.min(100, (disk.used / disk.total) * 100)}%` }} />
            </span>
            {fmtSize(disk.avail)} free
          </span>
        )}
      </div>

      <Dialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <DialogContent className="sm:max-w-sm">
          {confirmDel && (
            <>
              <DialogHeader>
                <DialogTitle>Delete {confirmDel.names.length === 1 ? confirmDel.names[0] : `${confirmDel.names.length} items`}?</DialogTitle>
                <DialogDescription>
                  {confirmDel.dirs ? `${confirmDel.dirs} folder${confirmDel.dirs > 1 ? 's' : ''}, ` : ''}
                  {confirmDel.files} file{confirmDel.files === 1 ? '' : 's'}, {fmtSize(confirmDel.bytes)}. There is no trash; this cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmDel(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  autoFocus
                  onClick={() => {
                    const names = confirmDel.names;
                    setConfirmDel(null);
                    act(() => del(names), 'deleting…');
                  }}
                >
                  Delete
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!chmod} onOpenChange={(o) => !o && setChmod(null)}>
        <DialogContent className="sm:max-w-xs">
          {chmod && (
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const c = chmod;
                setChmod(null);
                act(() => Chmod(src, join(c.name), c.mode), 'chmod…');
              }}
            >
              <DialogHeader>
                <DialogTitle>Permissions · {chmod.name}</DialogTitle>
              </DialogHeader>
              <div className="flex gap-1">
                {['644', '600', '755', '700', '775'].map((m) => (
                  <Button key={m} type="button" size="xs" variant={chmod.mode === m ? 'default' : 'outline'} onClick={() => setChmod({ ...chmod, mode: m })}>
                    {m}
                  </Button>
                ))}
              </div>
              <Input autoFocus value={chmod.mode} onChange={(e) => setChmod({ ...chmod, mode: e.target.value.replace(/[^0-7]/g, '').slice(0, 4) })} className="font-mono" />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setChmod(null)}>
                  Cancel
                </Button>
                <Button type="submit">Apply</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-3xl">
          {preview && (
            <>
              <DialogHeader>
                <DialogTitle className="truncate font-mono text-sm">
                  {preview.name} <span className="text-muted-foreground">· {fmtSize(preview.p.size)}</span>
                </DialogTitle>
              </DialogHeader>
              {preview.p.kind === 'image' && <img src={preview.p.data} alt={preview.name} className="max-h-[70vh] w-auto justify-self-center rounded-lg object-contain" />}
              {preview.p.kind === 'text' && (
                <pre className="max-h-[70vh] overflow-auto rounded-lg bg-muted/40 p-3 font-mono text-[11px] leading-snug whitespace-pre-wrap">
                  {preview.p.text}
                  {preview.p.more ? '\n…' : ''}
                </pre>
              )}
              {preview.p.kind === 'binary' && <p className="text-sm text-muted-foreground">Binary or too large to preview.</p>}
              <DialogFooter>
                <Button variant="outline" onClick={() => setPreview(null)}>
                  Close
                </Button>
                {preview.p.kind === 'text' && (
                  <Button
                    onClick={() => {
                      onOpen(join(preview.name));
                      setPreview(null);
                    }}
                  >
                    Edit
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditInput({ edit, setEdit, commit }: { edit: Edit; setEdit(e: Edit | null): void; commit(): void }) {
  return (
    <Input
      autoFocus
      value={edit.value}
      placeholder={edit.kind === 'mkdir' ? 'folder name' : ''}
      onChange={(e) => setEdit({ ...edit, value: e.target.value })}
      onBlur={() => setEdit(null)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setEdit(null);
      }}
      className="h-5 px-1 font-mono text-xs"
      spellCheck={false}
    />
  );
}
