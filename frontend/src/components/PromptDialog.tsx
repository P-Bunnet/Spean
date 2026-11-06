import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Answer } from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';

type Prompt = { id: string; kind: 'hostkey' | 'passphrase' | 'password' | 'conflict'; alias: string; msg: string; secret: boolean };
const titles = { hostkey: 'Unknown host', passphrase: 'Key passphrase', password: 'Password', conflict: 'File exists' };
const conflictChoices = [
  ['overwrite', 'Overwrite'],
  ['newer', 'Overwrite if newer'],
  ['rename', 'Keep both'],
  ['skip', 'Skip'],
] as const;

// Backend blocks in App.Ask until Answer(id, value) arrives. Prompts queue if several hops ask at once.
export function PromptDialog({ onRemember }: { onRemember(alias: string, kind: string, value: string): void }) {
  const [queue, setQueue] = useState<Prompt[]>([]);
  const [value, setValue] = useState('');
  const [remember, setRemember] = useState(false);
  const cur = queue[0];

  useEffect(() => EventsOn('prompt', (p: Prompt) => setQueue((q) => [...q, p])), []);

  function answer(v: string) {
    Answer(cur.id, v);
    if (remember && v && (cur.kind === 'password' || cur.kind === 'passphrase') && cur.alias) onRemember(cur.alias, cur.kind, v);
    setValue('');
    setRemember(false);
    setQueue((q) => q.slice(1));
  }

  return (
    <Dialog open={!!cur} onOpenChange={(o) => !o && cur && answer(cur.kind === 'hostkey' ? 'no' : cur.kind === 'conflict' ? 'skip' : '')}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        {cur && (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              answer(cur.kind === 'hostkey' ? 'yes' : value);
            }}
          >
            <DialogHeader>
              <DialogTitle>{titles[cur.kind]}</DialogTitle>
              <DialogDescription className="whitespace-pre-wrap font-mono text-xs">{cur.msg}</DialogDescription>
            </DialogHeader>
            {cur.kind !== 'hostkey' && cur.kind !== 'conflict' && (
              <>
                <Input type="password" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
                {cur.alias && (
                  <Label className="flex items-center gap-2 text-xs">
                    <Checkbox checked={remember} onCheckedChange={(c) => setRemember(!!c)} />
                    Remember in vault for {cur.alias}
                  </Label>
                )}
              </>
            )}
            {cur.kind === 'conflict' ? (
              <DialogFooter className="flex-wrap">
                <p className="w-full text-xs text-muted-foreground">Applies to every collision in this transfer.</p>
                {conflictChoices.map(([v, l]) => (
                  <Button key={v} type="button" variant={v === 'skip' ? 'outline' : 'default'} onClick={() => answer(v)}>
                    {l}
                  </Button>
                ))}
              </DialogFooter>
            ) : (
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => answer(cur.kind === 'hostkey' ? 'no' : '')}>
                {cur.kind === 'hostkey' ? 'Reject' : 'Cancel'}
              </Button>
              <Button type="submit" autoFocus={cur.kind === 'hostkey'}>
                {cur.kind === 'hostkey' ? 'Trust' : 'OK'}
              </Button>
            </DialogFooter>
            )}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
