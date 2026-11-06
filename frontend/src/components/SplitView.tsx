import { useRef, useState } from 'react';

type Props = { dir: 'row' | 'col'; children: React.ReactNode[]; className?: string };

/** N children with draggable dividers. Sizes are fractions; drag moves the boundary between two neighbours. */
export function SplitView({ dir, children, className = '' }: Props) {
  const n = children.length;
  const [sizes, setSizes] = useState<number[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const s = sizes.length === n ? sizes : Array(n).fill(1 / n);

  function drag(i: number, e: React.MouseEvent) {
    e.preventDefault();
    const rect = box.current!.getBoundingClientRect();
    const total = dir === 'row' ? rect.width : rect.height;
    const start = dir === 'row' ? e.clientX : e.clientY;
    const a0 = s[i], b0 = s[i + 1];
    const move = (ev: MouseEvent) => {
      const d = ((dir === 'row' ? ev.clientX : ev.clientY) - start) / total;
      const a = Math.min(Math.max(a0 + d, 0.1), a0 + b0 - 0.1);
      setSizes(s.map((v, j) => (j === i ? a : j === i + 1 ? a0 + b0 - a : v)));
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  return (
    <div ref={box} className={`flex min-h-0 min-w-0 flex-1 ${dir === 'row' ? 'flex-row' : 'flex-col'} ${className}`}>
      {children.map((c, i) => (
        <div key={i} className="contents">
          <div className="flex min-h-0 min-w-0 flex-col" style={{ flex: `${s[i]} 1 0%` }}>
            {c}
          </div>
          {i < n - 1 && (
            <div
              onMouseDown={(e) => drag(i, e)}
              className={`shrink-0 bg-border hover:bg-sky-500 ${dir === 'row' ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'}`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
