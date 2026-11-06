import { useState } from 'react';
import { MOD } from '@/lib/keys';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ImportHost } from '../../wailsjs/go/main/App';
import type { config } from '../../wailsjs/go/models';

type Props = { open: boolean; hosts: config.Entry[]; onDone(): void; onAddHost(): void };

/** First run: import from ~/.ssh/config, what a jump chain is, done. */
export function Onboarding({ open, hosts, onDone, onAddHost }: Props) {
  const [step, setStep] = useState(0);
  const cfg = hosts.filter((h) => !h.saved);
  const [pick, setPick] = useState<Set<string>>(() => new Set(cfg.map((h) => h.alias)));
  const [busy, setBusy] = useState(false);

  async function next() {
    if (step === 0 && pick.size) {
      setBusy(true);
      for (const a of pick) await ImportHost(a).catch(() => {});
      setBusy(false);
    }
    if (step < 2) setStep(step + 1);
    else onDone();
  }

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-lg" showCloseButton={false}>
        {step === 0 && (
          <>
            <DialogHeader>
              <DialogTitle>Welcome to ស្ពាន</DialogTitle>
              <DialogDescription>
                {cfg.length
                  ? `Found ${cfg.length} host${cfg.length === 1 ? '' : 's'} in ~/.ssh/config. They work as they are; importing makes them editable in Spean (the file itself is never changed).`
                  : 'No ~/.ssh/config hosts found. You can add hosts by hand, or type user@host in the search box any time.'}
              </DialogDescription>
            </DialogHeader>
            {cfg.length > 0 && (
              <ul className="max-h-48 overflow-y-auto text-xs">
                {cfg.map((h) => (
                  <li key={h.alias}>
                    <Label className="flex items-center gap-2 py-1">
                      <Checkbox
                        checked={pick.has(h.alias)}
                        onCheckedChange={(c) =>
                          setPick((p) => {
                            const n = new Set(p);
                            if (c) n.add(h.alias);
                            else n.delete(h.alias);
                            return n;
                          })
                        }
                      />
                      {h.alias} <span className="font-mono text-muted-foreground">{h.hostName}</span>
                    </Label>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {step === 1 && (
          <>
            <DialogHeader>
              <DialogTitle>Jump hosts, any depth</DialogTitle>
              <DialogDescription>
                Set a host's <b>Jump hosts</b> to the bastions in front of it, comma separated. Spean opens each hop through the one before it, like <code>ssh -J</code>, and shows progress per hop.
              </DialogDescription>
            </DialogHeader>
            <svg viewBox="0 0 440 110" className="w-full text-neutral-400">
              <defs>
                <linearGradient id="arc" x1="0" x2="1">
                  <stop offset="0" stopColor="#38bdf8" />
                  <stop offset="1" stopColor="#2563eb" />
                </linearGradient>
              </defs>
              {[
                ['you', 40],
                ['bastion', 160],
                ['dmz', 280],
                ['db', 400],
              ].map(([n, x]) => (
                <g key={n as string}>
                  <rect x={(x as number) - 28} y={60} width={56} height={30} rx={8} fill="none" stroke="currentColor" />
                  <text x={x as number} y={80} textAnchor="middle" fontSize="12" fill="currentColor">
                    {n}
                  </text>
                </g>
              ))}
              <path d="M40 60 Q100 10 160 60" fill="none" stroke="url(#arc)" strokeWidth="2" />
              <path d="M160 60 Q220 10 280 60" fill="none" stroke="url(#arc)" strokeWidth="2" />
              <path d="M280 60 Q340 10 400 60" fill="none" stroke="url(#arc)" strokeWidth="2" />
              <text x={220} y={104} textAnchor="middle" fontSize="11" fill="currentColor" fontFamily="monospace">
                db: Jump hosts = bastion, dmz
              </text>
            </svg>
          </>
        )}
        {step === 2 && (
          <DialogHeader>
            <DialogTitle>That's it</DialogTitle>
            <DialogDescription>
              <kbd className="rounded border border-white/20 px-1.5">{MOD}K</kbd> connects to anything. <kbd className="rounded border border-white/20 px-1.5">{MOD}⇧F</kbd> opens files, <kbd className="rounded border border-white/20 px-1.5">{MOD},</kbd> settings. Host keys are always verified; passwords are only stored if you ask, in an encrypted vault.
            </DialogDescription>
          </DialogHeader>
        )}
        <DialogFooter>
          {step === 0 && !cfg.length && (
            <Button
              variant="outline"
              onClick={() => {
                onDone();
                onAddHost();
              }}
            >
              Add a host
            </Button>
          )}
          <Button onClick={next} disabled={busy}>
            {step === 2 ? 'Start' : step === 0 && pick.size ? `Import ${pick.size}` : 'Next'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
