// Adapted from obsidianui.dev Magnet Tabs (MIT): sliding underline + hover highlight
// via motion layoutId. Extended with a close button and a "closed" (dead session) style.
import { useState } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';

export type MagnetTab = { id: string; label: string; closed?: boolean; activity?: 'output' | 'bell' };

type Props = {
  tabs: MagnetTab[];
  activeId?: string;
  onSelect(id: string): void;
  onClose(id: string): void;
};

export function MagnetTabs({ tabs, activeId, onSelect, onClose }: Props) {
  const [hovered, setHovered] = useState<string>();
  return (
    <ul className="flex min-w-0 flex-1 overflow-x-auto">
      {tabs.map((t) => {
        const isActive = t.id === activeId;
        return (
          <li
            key={t.id}
            onMouseEnter={() => setHovered(t.id)}
            onMouseLeave={() => setHovered(undefined)}
            onClick={() => onSelect(t.id)}
            onAuxClick={(e) => e.button === 1 && onClose(t.id)}
            className="group relative shrink-0 cursor-pointer"
            style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}
          >
            <div
              className={`relative z-10 flex h-9 max-w-48 items-center gap-1 px-3 text-xs transition-opacity ${
                isActive ? 'opacity-100' : 'opacity-50 hover:opacity-100'
              } ${t.closed ? 'italic' : ''}`}
            >
              {t.activity && <span className={`size-1.5 shrink-0 rounded-full ${t.activity === 'bell' ? 'bg-amber-400' : 'bg-brand'}`} title={t.activity === 'bell' ? 'bell' : 'new output'} />}
              <span className="truncate">{t.label}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(t.id);
                }}
                className="invisible rounded p-0.5 hover:bg-white/10 group-hover:visible"
                aria-label="Close tab"
              >
                <X className="size-3" />
              </button>
            </div>
            {isActive && (
              <motion.div
                layout
                layoutId="spean-tab-underline"
                transition={{ duration: 0.2, type: 'spring', bounce: 0.2 }}
                className="brand-grad absolute bottom-0 left-0 h-0.5 w-full rounded-sm"
              />
            )}
            {(hovered === t.id || (hovered === undefined && isActive)) && (
              <motion.div
                layout
                layoutId="spean-tab-highlight"
                transition={{ duration: 0.2, type: 'spring', bounce: 0 }}
                className="absolute inset-0 rounded-sm bg-white/5"
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
