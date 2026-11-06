import { OnFileDrop } from '../../wailsjs/runtime/runtime';

// Wails allows one OnFileDrop callback. Route Finder drops by the element under the cursor:
// the nearest ancestor with data-drop="<key>" gets the paths.
type Handler = (paths: string[], el: HTMLElement) => void;
const handlers = new Map<string, Handler>();
let installed = false;

export function onDrop(key: string, h: Handler) {
  handlers.set(key, h);
  if (!installed) {
    installed = true;
    OnFileDrop((x, y, paths) => {
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]');
      if (el) handlers.get(el.dataset.drop!)?.(paths, el);
    }, true);
  }
  return () => {
    handlers.delete(key);
  };
}
