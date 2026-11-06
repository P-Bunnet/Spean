import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ForwardStart } from '../../wailsjs/go/main/App';

type Props = { tab: { id: string; label: string } | null; onClose(): void };

const hints = {
  local: ['127.0.0.1:8080', 'localhost:80', 'Local port → host reachable from the server (ssh -L)'],
  remote: ['0.0.0.0:8080', '127.0.0.1:3000', 'Port on the server → host reachable from here (ssh -R)'],
  dynamic: ['127.0.0.1:1080', '', 'SOCKS5 proxy through the server (ssh -D)'],
};

export function ForwardDialog({ tab, onClose }: Props) {
  const [kind, setKind] = useState<keyof typeof hints>('local');
  const [listen, setListen] = useState('');
  const [target, setTarget] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    if (tab) {
      setKind('local');
      setListen('');
      setTarget('');
      setErr('');
    }
  }, [tab]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!tab) return;
    try {
      await ForwardStart(tab.id, kind, listen || hints[kind][0], target || hints[kind][1]);
      onClose();
    } catch (e) {
      setErr(String(e));
    }
  }

  return (
    <Dialog open={!!tab} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={start} className="grid gap-3">
          <DialogHeader>
            <DialogTitle>Forward port on {tab?.label}</DialogTitle>
            <DialogDescription>{hints[kind][2]}</DialogDescription>
          </DialogHeader>
          <div className="flex gap-1">
            {(Object.keys(hints) as (keyof typeof hints)[]).map((k) => (
              <Button key={k} type="button" size="sm" variant={kind === k ? 'default' : 'outline'} onClick={() => setKind(k)}>
                {k}
              </Button>
            ))}
          </div>
          <Input placeholder={`Listen: ${hints[kind][0]}`} value={listen} onChange={(e) => setListen(e.target.value)} spellCheck={false} className="font-mono" />
          {kind !== 'dynamic' && <Input placeholder={`Target: ${hints[kind][1]}`} value={target} onChange={(e) => setTarget(e.target.value)} spellCheck={false} className="font-mono" />}
          {err && <p className="text-xs text-destructive">{err}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Start</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
