// Modifier label for shortcut hints. Set once at startup from the backend's Platform(); the
// keymap itself already accepts metaKey or ctrlKey, this only changes what we print.
export let MOD = '⌘';
export function setPlatform(goos: string) {
  MOD = goos === 'darwin' ? '⌘' : 'Ctrl+';
}
