import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { VaultCreate, VaultUnlock } from '../../wailsjs/go/main/App';

type Props = {
  mode: 'unlock' | 'create' | null;
  onDone(ok: boolean): void; // false = skipped / cancelled
};

/** Master-password screen. Unlock at launch (skippable), create on first "Remember". */
export function VaultDialog({ mode, onDone }: Props) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setPw('');
    setPw2('');
    setErr('');
  }, [mode]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === 'create' && pw !== pw2) return setErr('passwords differ');
    setBusy(true);
    try {
      await (mode === 'create' ? VaultCreate(pw) : VaultUnlock(pw));
      onDone(true);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!mode} onOpenChange={(o) => !o && onDone(false)}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <form onSubmit={submit} className="grid gap-3">
          <DialogHeader>
            <DialogTitle>{mode === 'create' ? 'Create vault' : 'Unlock vault'}</DialogTitle>
            <DialogDescription>
              {mode === 'create'
                ? 'Passwords, passphrases and imported keys are encrypted with this master password (argon2id + XChaCha20-Poly1305). It is never stored; forget it and the vault is gone.'
                : 'Remembered passwords and keys stay locked until you unlock. Sessions work either way.'}
            </DialogDescription>
          </DialogHeader>
          <Input autoFocus type="password" placeholder="Master password" value={pw} onChange={(e) => setPw(e.target.value)} />
          {mode === 'create' && <Input type="password" placeholder="Again" value={pw2} onChange={(e) => setPw2(e.target.value)} />}
          {err && <p className="text-xs text-destructive">{err}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onDone(false)}>
              {mode === 'create' ? 'Cancel' : 'Later'}
            </Button>
            <Button type="submit" disabled={busy || !pw}>
              {mode === 'create' ? 'Create' : 'Unlock'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
