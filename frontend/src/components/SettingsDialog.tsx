import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { previewSettings, saveSettings, themes, useSettings } from '@/lib/settings';
import { CheckUpdate, ExportAll, ImportAll, OpenDataDir, VaultForgetKeychain, Version } from '../../wailsjs/go/main/App';
import { BrowserOpenURL } from '../../wailsjs/runtime/runtime';
import { config } from '../../wailsjs/go/models';

/** One dialog, one settings.json. Changes preview live on open terminals; Cancel reverts. */
export function SettingsDialog({ open, onClose, onImported }: { open: boolean; onClose(): void; onImported(): void }) {
  const saved = useSettings();
  const [d, setD] = useState<config.Settings | null>(null);
  const [orig, setOrig] = useState<config.Settings | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [ver, setVer] = useState('');
  const [upd, setUpd] = useState('');
  useEffect(() => {
    Version().then(setVer);
  }, []);
  useEffect(() => {
    if (open && saved) {
      setD(new config.Settings({ ...saved }));
      setOrig(saved);
      setErr('');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return null;

  const set = (patch: Partial<config.Settings>) => {
    const next = new config.Settings({ ...d, ...patch });
    setD(next);
    previewSettings(next);
  };
  const cancel = () => {
    if (orig) previewSettings(orig);
    onClose();
  };
  const num = (k: keyof config.Settings) => (e: React.ChangeEvent<HTMLInputElement>) => set({ [k]: Number(e.target.value) || 0 });
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <Label className="grid grid-cols-[9rem_1fr] items-center gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </Label>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && cancel()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await saveSettings(d);
              onClose();
            } catch (e) {
              setErr(String(e));
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
          </DialogHeader>
          <Row label="Font">
            <Input value={d.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })} className="h-7 text-xs" spellCheck={false} />
          </Row>
          <Row label="Font size">
            <Input type="number" min={6} max={40} value={d.fontSize} onChange={num('fontSize')} className="h-7 w-20 text-xs" />
          </Row>
          <Row label="Theme">
            <select value={d.theme} onChange={(e) => set({ theme: e.target.value })} className="h-7 rounded bg-muted px-1 text-xs">
              {Object.keys(themes).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Row>
          <Row label="Scrollback lines">
            <Input type="number" min={0} value={d.scrollback} onChange={num('scrollback')} className="h-7 w-24 text-xs" />
          </Row>
          <Row label="Cursor">
            <span className="flex items-center gap-3">
              <select value={d.cursorStyle} onChange={(e) => set({ cursorStyle: e.target.value })} className="h-7 rounded bg-muted px-1 text-xs">
                {['block', 'underline', 'bar'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <Checkbox checked={d.cursorBlink} onCheckedChange={(c) => set({ cursorBlink: !!c })} /> blink
            </span>
          </Row>
          <Row label="Bell">
            <span className="flex items-center gap-2">
              <Checkbox checked={d.bell} onCheckedChange={(c) => set({ bell: !!c })} /> flash on BEL
            </span>
          </Row>
          <Row label="Keepalive (s)">
            <Input type="number" min={5} value={d.keepaliveSec} onChange={num('keepaliveSec')} className="h-7 w-20 text-xs" />
          </Row>
          <Row label="Copy on select">
            <span className="flex items-center gap-2">
              <Checkbox checked={d.copyOnSelect} onCheckedChange={(c) => set({ copyOnSelect: !!c })} /> selecting terminal text copies it
            </span>
          </Row>
          <Row label="Reconnect">
            <span className="flex items-center gap-2">
              <Checkbox checked={d.autoReconnect} onCheckedChange={(c) => set({ autoReconnect: !!c })} /> retry automatically after a dropped connection
            </span>
          </Row>
          <Row label="Vault">
            <span className="flex items-center gap-2">
              <Checkbox
                checked={d.keychain}
                onCheckedChange={(c) => {
                  set({ keychain: !!c });
                  if (!c) VaultForgetKeychain();
                }}
              />{' '}
              keep the master password in the OS keychain (unlocks at launch)
            </span>
          </Row>
          <Row label="Confirm close">
            <span className="flex items-center gap-2">
              <Checkbox checked={d.confirmClose} onCheckedChange={(c) => set({ confirmClose: !!c })} /> ask before closing a live tab
            </span>
          </Row>
          <Row label="Parallel transfers">
            <span className="flex items-center gap-2">
              <Input type="number" min={1} max={8} value={d.concurrency} onChange={num('concurrency')} className="h-7 w-16 text-xs" />
              <span className="text-muted-foreground">applies at next launch</span>
            </span>
          </Row>
          <Row label="Updates">
            <span className="flex flex-wrap items-center gap-2">
              <Checkbox checked={d.updateCheck} onCheckedChange={(c) => set({ updateCheck: !!c })} /> check GitHub for a new release at launch
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() =>
                  CheckUpdate()
                    .then((u) => setUpd(u.newer ? `${u.latest} available` : `up to date (${u.latest || u.current})`))
                    .catch((e) => setUpd(String(e)))
                }
              >
                Check now
              </Button>
              {upd && (
                <button type="button" className="text-[11px] text-brand underline" onClick={() => BrowserOpenURL('https://github.com/P-Bunnet/Spean/releases/latest')}>
                  {upd}
                </button>
              )}
            </span>
          </Row>
          <div className="mt-1 grid gap-1 rounded-xl bg-muted/40 p-2 ring-1 ring-white/10">
            <p className="text-[11px] text-muted-foreground">Spean {ver} · AGPL-3.0 · github.com/P-Bunnet/Spean</p>
            <p className="text-[11px] text-muted-foreground">Your data lives outside the app; reinstalling keeps it. Export one file to back up or move machines.</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => ExportAll().then((p) => setMsg(p ? `exported to ${p}` : '')).catch((e) => setMsg(String(e)))}>
                Export everything…
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  ImportAll()
                    .then((m) => {
                      setMsg(m);
                      if (m) onImported();
                    })
                    .catch((e) => setMsg(String(e)))
                }
              >
                Import…
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => OpenDataDir()}>
                Open data folder
              </Button>
            </div>
            {msg && <p className="text-[11px] text-muted-foreground">{msg}</p>}
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={cancel}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
