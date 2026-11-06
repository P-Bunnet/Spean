import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type RightTab = 'files' | 'docker' | 'notes' | 'ports';
const MIN = 320;
const key = 'spean.rightW';
const defaultW = () => Math.round(Math.min(720, window.innerWidth * 0.45));
const load = () => {
  try {
    return Number(localStorage.getItem(key)) || defaultW();
  } catch {
    return defaultW();
  }
};

type Props = {
  tab: RightTab;
  onTab(t: RightTab): void;
  onClose(): void;
  dockerAvailable: boolean;
  notesAvailable: boolean;
  children: React.ReactNode; // the active panel
};

/** One right-hand slot for Files or Docker: resizable from its left edge, width persisted, slides in. */
export function RightPane({ tab, onTab, onClose, dockerAvailable, notesAvailable, children }: Props) {
  const [w, setW] = useState(load);
  const box = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    try {
      localStorage.setItem(key, String(w));
    } catch {}
  }, [w]);

  function drag(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX, w0 = w;
    const move = (ev: MouseEvent) => setW(Math.min(Math.max(w0 + (startX - ev.clientX), MIN), window.innerWidth - 480));
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  return (
    <motion.aside
      ref={box}
      initial={reduce ? false : { x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: 'spring', bounce: 0.15, duration: 0.25 }}
      style={{ width: w }}
      className="relative flex min-h-0 shrink-0 flex-col bg-background ring-1 ring-white/10 @container"
    >
      <div onMouseDown={drag} className="absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize hover:bg-brand/50" title="Drag to resize" />
      <div className="flex h-9 items-center gap-1 px-2">
        <div className="flex rounded-lg bg-muted p-0.5 text-xs">
          <button type="button" onClick={() => onTab('files')} className={`rounded-md px-2.5 py-0.5 ${tab === 'files' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            Files
          </button>
          {dockerAvailable && (
            <button type="button" onClick={() => onTab('docker')} className={`rounded-md px-2.5 py-0.5 ${tab === 'docker' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              Docker
            </button>
          )}
          {dockerAvailable && (
            <button type="button" onClick={() => onTab('ports')} className={`rounded-md px-2.5 py-0.5 ${tab === 'ports' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              Ports
            </button>
          )}
          {notesAvailable && (
            <button type="button" onClick={() => onTab('notes')} className={`rounded-md px-2.5 py-0.5 ${tab === 'notes' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              Notes
            </button>
          )}
        </div>
        <Button size="icon-xs" variant="ghost" className="ml-auto" title="Close (Esc)" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </motion.aside>
  );
}
