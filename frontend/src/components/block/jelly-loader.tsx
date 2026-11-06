// From obsidianui.dev (MIT). Sized down and recoloured for Spean.
import { motion, type Transition } from 'motion/react';

type JellyLoaderProps = { numberOfCubes?: number; colors?: string[] };

export function JellyLoader({
  numberOfCubes = 6,
  colors = ['#bae6fd', '#7dd3fc', '#38bdf8', '#0ea5e9', '#2563eb', '#1d4ed8'],
}: JellyLoaderProps) {
  const transition: Transition = { duration: 1.5, repeat: Infinity, repeatDelay: 0.5, ease: 'easeOut' };
  return (
    <div className="relative h-16 w-24">
      {Array.from({ length: numberOfCubes }).map((_, index) => (
        <motion.span
          key={index}
          className="absolute h-7 w-10 rounded-full"
          style={{
            x: index * 6,
            y: -index * 6 + 24,
            zIndex: numberOfCubes - index,
            backgroundColor: colors[index % colors.length],
            opacity: 1 - index * 0.08,
          }}
          initial={{ scale: 1 }}
          animate={{ scale: [1, 0.75, 1], rotate: [0, 360] }}
          transition={{ ...transition, delay: index * 0.05 }}
        />
      ))}
    </div>
  );
}
