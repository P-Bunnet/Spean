import { useEffect, useState } from 'react';
import { Copy, KeyRound, Plus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GenerateKey, InstallKey, ListKeys, VaultStatus } from '../../wailsjs/go/main/App';
import { ClipboardSetText } from '../../wailsjs/runtime/runtime';
import type { main } from '../../wailsjs/go/models';

type Props = {
  open: boolean;
  onClose(): void;
  tabs: { id: string; label: string }[]; // live tabs = install targets
  onNeedVault(): Promise<boolean>; // unlock/create before storing a key in the vault
  onPick?(ref: string): void; // host editor: choose this key
};

/** Keys from ~/.ssh (read-only) and the vault. Generate ed25519, copy public, install on a connected host. */
export function KeyManager({ open, onClose, tabs, onNeedVault, onPick }: Props) {
  const [keys, setKeys] = useState<main.KeyInfo[]>([]);
  const [gen, setGen] = useState<{ name: string; pass: string; vault: boolean } | null>(null);
  const [msg, setMsg] = useState('');
  const [target, setTarget] = useState('');
  const reload = () => ListKeys().then((k) => setKeys(k ?? []));
  useEffect(() => {
    if (open) {
      reload();
      setMsg('');
      setTarget(tabs[0]?.id ?? '');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generate() {
    if (!gen) return;
    if (gen.vault) {
      const st = await VaultStatus();
      if (st.locked && !(await onNeedVault())) return;
    }
    try {
      const k = await GenerateKey(gen.name, gen.pass, gen.vault);
      setMsg(`created ${k.ref}`);
      setGen(null);
      reload();
    } catch (e) {
      setMsg(String(e));
    }
  }

  async function install(k: main.KeyInfo) {
    if (!target) return setMsg('open a tab to the host first');
    setMsg('installing…');
    try {
      await InstallKey(target, k.public);
      setMsg(`${k.name} added to authorized_keys on ${tabs.find((t) => t.id === target)?.label}`);
    } catch (e) {
      setMsg(String(e));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keys</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Install target</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="h-7 rounded bg-muted px-1">
            {!tabs.length && <option value="">no connected tab</option>}
            {tabs.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <span className="ml-auto truncate text-muted-foreground">{msg}</span>
        </div>
        <ul className="divide-y text-xs">
          {keys.map((k) => (
            <li key={k.ref} className="flex items-center gap-2 py-1.5">
              <KeyRound className="size-4 shrink-0 text-sky-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  {k.name} <span className="text-muted-foreground">· {k.type || 'unknown'} · {k.source}{k.encrypted ? ' · passphrase' : ''}</span>
                </p>
                <p className="truncate font-mono text-[10px] text-muted-foreground">{k.fingerprint || k.ref}</p>
              </div>
              {onPick && (
                <Button size="xs" variant="outline" onClick={() => onPick(k.ref)}>
                  Use
                </Button>
              )}
              <Button size="icon-xs" variant="ghost" title="Copy public key" disabled={!k.public} onClick={() => ClipboardSetText(k.public).then(() => setMsg('public key copied'))}>
                <Copy />
              </Button>
              <Button size="icon-xs" variant="ghost" title="Install on target host (ssh-copy-id)" disabled={!k.public || !target} onClick={() => install(k)}>
                <Upload />
              </Button>
            </li>
          ))}
          {!keys.length && <li className="py-2 text-muted-foreground">no keys in ~/.ssh or the vault</li>}
        </ul>
        {gen ? (
          <form
            className="grid gap-2 rounded-lg bg-muted/50 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              generate();
            }}
          >
            <Input autoFocus placeholder="Name (e.g. id_spean)" value={gen.name} onChange={(e) => setGen({ ...gen, name: e.target.value })} spellCheck={false} />
            <Input type="password" placeholder="Passphrase (optional)" value={gen.pass} onChange={(e) => setGen({ ...gen, pass: e.target.value })} />
            <Label className="flex items-center gap-2 text-xs">
              <Checkbox checked={gen.vault} onCheckedChange={(c) => setGen({ ...gen, vault: !!c })} />
              Store in the vault instead of ~/.ssh
            </Label>
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setGen(null)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!gen.name}>
                Generate ed25519
              </Button>
            </div>
          </form>
        ) : (
          <Button size="sm" variant="outline" className="justify-self-start" onClick={() => setGen({ name: 'id_spean', pass: '', vault: false })}>
            <Plus /> New key
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
