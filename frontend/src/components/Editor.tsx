import { useEffect, useRef, useState } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { languages } from '@codemirror/language-data';
import { oneDark } from '@codemirror/theme-one-dark';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Delete, ReadFile, WriteFile } from '../../wailsjs/go/main/App';
import { useSettings, themes } from '@/lib/settings';

export type EditorHandle = { save(): Promise<void>; dirty(): boolean };

type Props = {
  src: string; // 'local' or tab id
  path: string; // display name when text is given
  text?: string; // read-only content tab (docker inspect); no ReadFile, no save
  hidden: boolean;
  onDirty(d: boolean): void;
  onSaved?(): void;
  run?(text: string, enter?: boolean): boolean; // the source tab's shell, for sudo save
};

const q = (p: string) => `'${p.replace(/'/g, `'\\''`)}'`;

/** CodeMirror 6 tab. Save = temp file + rename on the backend; permission denied offers "Save with sudo". */
export function Editor({ src, path, text, hidden, onDirty, onSaved, run, handle }: Props & { handle: React.RefObject<EditorHandle | null> }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);
  const savedDoc = useRef('');
  const eol = useRef('\n');
  const [msg, setMsg] = useState('loading…');
  const [sudo, setSudo] = useState<string | null>(null); // error text when a sudo save is offered
  const settings = useSettings();
  const light = !!(settings && themes[settings.theme]?.light);
  const readOnly = text !== undefined;

  useEffect(() => {
    const theme = new Compartment();
    let v: EditorView | undefined;
    (text !== undefined ? Promise.resolve(text) : ReadFile(src, path))
      .then(async (text) => {
        eol.current = text.includes('\r\n') ? '\r\n' : '\n';
        const doc = text.replaceAll('\r\n', '\n');
        savedDoc.current = doc;
        const lang = languages.find((l) => l.extensions.some((e) => path.endsWith('.' + e)) || l.filename?.test(path.split('/').pop() ?? ''));
        const support = lang ? await lang.load() : [];
        v = new EditorView({
          parent: host.current!,
          state: EditorState.create({
            doc,
            extensions: [
              basicSetup,
              keymap.of([indentWithTab]),
              theme.of(light ? [] : oneDark),
              support,
              EditorState.readOnly.of(readOnly),
              EditorView.updateListener.of((u) => u.docChanged && onDirty(u.state.doc.toString() !== savedDoc.current)),
              EditorView.theme({ '&': { height: '100%', fontSize: '13px' }, '.cm-scroller': { fontFamily: 'JetBrains Mono, Menlo, monospace' } }),
            ],
          }),
        });
        view.current = v;
        setMsg('');
      })
      .catch((e) => setMsg(String(e)));
    return () => v?.destroy();
  }, [src, path]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    const v = view.current;
    if (!v || readOnly) return;
    const doc = v.state.doc.toString();
    setMsg('saving…');
    try {
      await WriteFile(src, path, doc.replaceAll('\n', eol.current));
      savedDoc.current = doc;
      onDirty(false);
      setMsg('saved');
      onSaved?.();
    } catch (e) {
      const s = String(e);
      setMsg(s);
      if (/permission denied/i.test(s) && run) setSudo(s);
    }
  }

  // Write to /tmp over SFTP, then let the shell do the privileged move; the password prompt happens in the terminal.
  async function saveSudo() {
    const v = view.current;
    if (!v) return;
    setSudo(null);
    const tmp = `/tmp/spean-${Math.random().toString(36).slice(2, 8)}`;
    try {
      await WriteFile(src, tmp, v.state.doc.toString().replaceAll('\n', eol.current));
    } catch (e) {
      setMsg(String(e));
      return;
    }
    if (run!(`sudo mv ${q(tmp)} ${q(path)}`)) {
      savedDoc.current = v.state.doc.toString();
      onDirty(false);
      setMsg('handed to sudo in the terminal');
    } else {
      Delete(src, tmp);
      setMsg('tab closed: reconnect, then save again');
    }
  }

  handle.current = { save, dirty: () => !!view.current && view.current.state.doc.toString() !== savedDoc.current };

  return (
    <div className={`min-h-0 flex-1 ${hidden ? 'hidden' : 'flex flex-col'}`}>
      <div ref={host} className="min-h-0 flex-1 overflow-hidden [&_.cm-editor]:h-full" />
      <div className="h-5 truncate border-t px-2 font-mono text-[11px] leading-5 text-muted-foreground">
        {path} {readOnly ? '· read-only' : ''} {msg && `· ${msg}`}
      </div>
      <Dialog open={!!sudo} onOpenChange={(o) => !o && setSudo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Permission denied</DialogTitle>
            <DialogDescription className="font-mono text-xs">{sudo}</DialogDescription>
          </DialogHeader>
          <p className="text-sm">Save to /tmp and run <code>sudo mv</code> in this tab's shell? sudo may ask for your password there.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSudo(null)}>
              Cancel
            </Button>
            <Button onClick={saveSudo}>Save with sudo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
