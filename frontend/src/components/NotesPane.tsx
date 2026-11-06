import { useEffect, useRef, useState } from 'react';
import { Notes, SetNotes } from '../../wailsjs/go/main/App';

/** Free-text notes per host, saved as you type (debounced). Runbooks, quirks, who to call. */
export function NotesPane({ alias }: { alias: string }) {
  const [text, setText] = useState('');
  const [state, setState] = useState<'loading' | 'saved' | 'dirty' | 'error'>('loading');
  const timer = useRef(0);
  useEffect(() => {
    setState('loading');
    Notes(alias).then((t) => {
      setText(t ?? '');
      setState('saved');
    });
  }, [alias]);
  function change(v: string) {
    setText(v);
    setState('dirty');
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => SetNotes(alias, v).then(() => setState('saved')).catch(() => setState('error')), 600);
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <textarea
        value={text}
        onChange={(e) => change(e.target.value)}
        placeholder={`Notes for ${alias}: how to deploy, what not to touch, who owns it…`}
        spellCheck={false}
        className="min-h-0 flex-1 resize-none bg-transparent p-3 font-mono text-xs leading-relaxed outline-none placeholder:text-muted-foreground"
      />
      <div className="px-3 py-1 text-[10px] text-muted-foreground">{state === 'dirty' ? 'saving…' : state === 'error' ? 'could not save' : state === 'saved' ? 'saved' : ''}</div>
    </div>
  );
}
