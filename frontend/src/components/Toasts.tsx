import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';

export type Toast = { id: number; text: string; sub?: string; tone?: 'ok' | 'warn' | 'err'; onClick?(): void };

/** Bottom-right stack; App owns the list and expiry. */
export function Toasts({ items, onClose }: { items: Toast[]; onClose(id: number): void }) {
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2">
      <AnimatePresence>
        {items.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.15 }}
            onClick={() => {
              t.onClick?.();
              onClose(t.id);
            }}
            className={`pointer-events-auto flex cursor-pointer items-start gap-2 rounded-xl bg-popover/95 p-3 text-xs ring-1 backdrop-blur ${
              t.tone === 'err' ? 'ring-red-500/40' : t.tone === 'warn' ? 'ring-amber-500/40' : t.tone === 'ok' ? 'ring-emerald-500/40' : 'ring-white/10'
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate">{t.text}</p>
              {t.sub && <p className="truncate font-mono text-[10px] text-muted-foreground">{t.sub}</p>}
            </div>
            <button
              type="button"
              className="shrink-0 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onClose(t.id);
              }}
            >
              <X className="size-3" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
