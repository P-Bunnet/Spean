# Spean — plan & handoff

**ស្ពាន** — Khmer for "bridge." Free, local-first SSH client with unlimited jump-host chaining. AGPL-3.0, github.com/P-Bunnet/Spean.

This is the one document to read before touching the code. Part 0 is what Spean is and is not. Part 1 is what exists today and how it is wired (the handoff). Part 2 is the roadmap and the rules every version follows. History of shipped versions is in `CHANGELOG.md`.

---

## Part 0 — What Spean is

### Goals

- Connect through any number of SSH jump hosts, no depth limit, with per-hop progress and errors that name the hop.
- Read and respect `~/.ssh/config`; never write to it (only append accepted host keys to `known_hosts`).
- Local-first: no account, no cloud sync, no telemetry. The only network calls are the SSH sessions you start and, opt-in, one request to GitHub for the latest release tag.
- The SSH chores people google — copy a key to a server, forward a port, edit a root-owned file, run one command on ten hosts, find which Swarm node runs a task — as one click or one palette verb.
- One screen: hosts left, tabs top, terminal centre; everything else slides in over it.

### Non-goals

- Cloud sync, team features, shared vaults, RBAC, mobile.
- A full local terminal emulator replacement (one local tab exists; that is all).
- A Portainer: the Docker panel runs real `docker` commands you could have typed, shown before they run. No create/edit forms.
- Cross-platform frameless chrome before v1.0 (macOS only today).

### Security rules (never relaxed)

1. **Host keys are always verified.** `~/.ssh/known_hosts` via `skeema/knownhosts`; unknown host → prompt with SHA256 fingerprint, append on accept; changed key → hard fail naming the `known_hosts` line. `ssh.InsecureIgnoreHostKey` does not exist in this codebase and must not appear, not behind a flag.
2. **Agent first.** `SSH_AUTH_SOCK` (unix) or the OpenSSH named pipe (Windows). With an explicit identity, only the matching agent key is offered first.
3. **Decrypted keys live in memory only**, for the session. Never written to disk, never logged.
4. **Secrets are opt-in and encrypted.** The vault (`vault.json`) is argon2id + XChaCha20-Poly1305 under a master password; the key lives in memory between unlock and `⌘L`. Keychain storage of the master password is a separate opt-in. `ponytail:` comments mark every path secrets flow through.
5. **Every user prompt is an in-app dialog.** WKWebView has no `alert/confirm/prompt`.
6. **Nothing is injected into the remote shell.** No login hook, no shell functions, no settings changed: the server's shell history holds only what the user typed or clicked to run. Consequence: Spean cannot tell whether the shell is at a prompt, so `Term.run()` types whenever the tab is open (like Termius/iTerm snippets).

### How the hop chain works

`sshx.DialChain`: dial hop 1 with `ssh.Dial`; for each next hop open `client.Dial("tcp", addr)` through the previous client and wrap it with `ssh.NewClientConn`. Every intermediate client is kept and released in reverse. Errors are `hop N (addr): …` and then classified by `sshx.Explain`. `ProxyJump` follows OpenSSH `-J`: the first element's own `ProxyJump` is honoured, later elements are dialled directly. Since v0.15 clients are pooled per route and refcounted, so a second tab through the same bastion reuses the login.

### Decisions log

- `~/.ssh/config` is read-only; Spean hosts live in `hosts.json` and are merged into one list (v0.2).
- Storage is versioned JSON files under the OS config dir, not bbolt (v0.8).
- Wails stays v2; v3 is beta and buys nothing for cross-platform (2026-09-21).
- Licence AGPL-3.0; free distribution path (ad-hoc signing, Homebrew tap, winget, SignPath) until downloads justify paid certificates (v0.23).
- Versions stay 0.x until the v1.0 gate (verified on real hosts on all three platforms) is met.

---

## Part 1 — Current state (handoff, 2026-09-21)

### Status in one paragraph

Spean is at **v0.23.0**, still 0.x on purpose. Every roadmap item from the original plan (v0.5–v0.11) plus twelve more versions (v0.12–v0.23) are built, type-checked, linted, unit-tested where there is logic to test, and cross-compiled for Windows/Linux. **Nothing since v0.5 has been run end-to-end against a real host** — the dev box has no sshd. That is the single biggest risk and the first job for whoever continues. The repo is going public under AGPL-3.0 with a tag-driven release pipeline; v1.0 is reserved for "verified on real machines on all three platforms".

Working tree only: one commit (`aa6d6ca Initial commit`) in history, everything else uncommitted. Owner commits and pushes; agents do not.

Size: ~4.4k lines Go (`.` + `internal/`), ~6.3k lines TS/TSX, 82 bound methods, 25 React components, 5 Go test packages.

### ▶ Resume here

1. **Ship it**: `git add -A && git commit`, make the repo public, `git tag v0.23.0 && git push --tags`. `release.yml` builds macOS/Linux/Windows and attaches archives, `SHA256SUMS`, `spean.rb`, winget manifests. Create `P-Bunnet/homebrew-tap` with `Casks/spean.rb` from the release.
2. **Smoke on real hosts** (this is v1.0's gate). Checklist under "Manual checks" below. Log every deviation as a GitHub issue; fix the connection flow first (`Connect`, `pool.go`, hook), everything else builds on it.
3. Then pick from "What we can do more" at the end of this part, or from user issues.

### Stack (decided, do not revisit)

| Layer | Choice | Why |
|---|---|---|
| Shell | Wails v2.16 (Go 1.25+) | mature Go SSH ecosystem; v3 is beta and adds nothing for cross-platform (decided 2026-09-21) |
| SSH | `golang.org/x/crypto/ssh` + `/agent` | direct-tcpip for hops, `Listen` for -R, `Dial("unix")` for the Docker bridge |
| Host keys | `github.com/skeema/knownhosts` | `HostKeyAlgorithms` ordering + `WriteKnownHost` |
| Config | `github.com/kevinburke/ssh_config` | `Include`, wildcards, defaults |
| SFTP | `github.com/pkg/sftp` | file panes + transfer engine's remote FS |
| Local PTY | `github.com/creack/pty` | local terminal tab (unix only; Windows hides the button) |
| Vault | `x/crypto/argon2` + `x/crypto/chacha20poly1305` | one encrypted JSON file, **not bbolt** |
| Keychain | `github.com/zalando/go-keyring` | opt-in master password storage |
| Windows | `github.com/Microsoft/go-winio` | agent named pipe, Docker npipe |
| Frontend | React 19 + Vite + Tailwind v4 + shadcn/ui (base-ui) + `motion` | |
| Terminal | `@xterm/xterm` + fit, search, web-links, unicode11, clipboard | |
| Editor | CodeMirror 6 | |

### Repository map

```
main.go                 wails.Run; window() from frameless_darwin.go / frameless_other.go (hidden title bar only on macOS)
app.go                  App core: tabs (remote + local), Connect/ConnectLocal/TestConnection, prompts (Ask/Answer),
                        files (List/Mkdir/Rename/Delete/ReadFile/WriteFile/ReadHistory), transfers, favorites, settings,
                        notes, runbooks, keepalive, exit classification, session log hook, expandHome
vault.go                Vault* (Create/Unlock/Lock/Remember/Forget/AutoUnlock/ForgetKeychain), ListKeys/GenerateKey/InstallKey, ImportHost
forward.go              ForwardStart/Stop/Forwards, DockerStart/DockerHost/DockerContextCreate, ListenPorts (+ ports_test.go)
exec.go                 Exec, MultiExec (streaming), Snippets, SaveSession/LastSession, LogStart/LogStop, Groups/SetGroup,
                        ClusterDetect/ClusterManager
files.go                CountTree/DeleteTree/Chmod/SearchFiles/ReadPreview/DiskUsage
history.go              HistoryAdd/HistorySearch over <data dir>/history.jsonl
export.go               ExportAll/ImportAll (bundle), DataDir/OpenDataDir
version.go              Version (ldflags), CheckUpdate (GitHub releases API, opt-in)
internal/config/        config.go (~/.ssh/config, Resolve, recursive Include), store.go (hosts.json v1: hosts, meta, snippets,
                        groups, runbooks; migration; MergeStore; rolling backups), settings.go (+ tests)
internal/sshx/          sshx.go (DialChain, auth order, vault-aware), pool.go (shared logins), explain.go (+ test),
                        agent_unix.go / agent_windows.go
internal/session/       session.go (remote PTY), local.go (creack/pty)
internal/transfer/      fs.go (Local/Remote FS), engine.go (jobs, queue, conflicts, progress, cancel, retry; + test)
internal/forward/       forward.go (-L/-R/-D/docker; built-in SOCKS5 CONNECT), listen_unix.go / listen_windows.go
internal/vault/         vault.go (+ test)
frontend/src/App.tsx    shell: grid [sidebar][main][right]; tabs = TermTab{sessions[],dir,focus} | EditorTab; keymap; vault flow;
                        restore; broadcast; auto-reconnect; toasts; palette verbs; selection menu
frontend/src/components/
  Term.tsx              xterm per session: run(), search, paste guard, pause/clear,
                        activity/selection hooks, per-host theme, ResizeObserver refit
  Editor.tsx            CodeMirror; atomic save; sudo save; read-only text tabs
  HostList.tsx          sidebar (full / icon rail): groups, star, reorder, status, docker badge, cluster menu, notes icon
  HostEditor.tsx        route strip + hop picker, Host/Route/Shell/Forwards&Docker/Organise, Test connection, Save & connect
  RightPane.tsx         resizable right slot: Files · Docker · Ports · Notes
  FileBrowser.tsx/Pane.tsx  dual/single pane files: DnD, clipboard, search, quick look, chmod, recursive delete, disk chip
  DockerPanel.tsx       Swarm/Docker tables, row actions, task→node hop, port click → forward, watch diffs
  PortsPane.tsx         listeners on host, one-click forward, saved forwards toggles
  NotesPane.tsx         per-host notes, autosave
  FavoriteBar.tsx       chips, star, history import, packs, placeholders, drop-to-run, snippets
  Runbooks.tsx          step-by-step runner with checkpoints
  HistoryPalette.tsx    ⌘R command history across hosts
  MultiExec.tsx, ClusterDialog.tsx, ForwardDialog.tsx, KeyManager.tsx, VaultDialog.tsx, PromptDialog.tsx,
  SettingsDialog.tsx, Onboarding.tsx, EmptyState.tsx, Drawer.tsx, SplitView.tsx, Toasts.tsx
  block/                magnet-tabs, spotlight (sections), jelly-loader, dotted-grid (shapes prop)
frontend/src/lib/       settings.ts (store + themes + live preview), drops.ts (Finder drop router), keys.ts (MOD label)
frontend/src/packs/     Docker / Swarm / Git / systemd favorite packs
.github/workflows/      build.yml (check + 3-OS build), release.yml (tags → GitHub Release with packaging)
packaging/              homebrew cask template, winget manifests, README (free distribution path)
```

### Data on disk (`os.UserConfigDir()/spean`)

`hosts.json` (v1; hosts, meta for config-only aliases, snippets, groups, runbooks), `settings.json`, `vault.json` (encrypted),
`session.json`, `history.jsonl`, `logs/`, `sock/`, `backups/` (last 5 hosts.json, ≤1 per 10 min). Formats are versioned;
newer-version files refuse writes. `~/.ssh/config` and `known_hosts` are only ever appended to (accepted host keys).

### Events (Go → JS)

`connect:progress:<sid>`, `term:data:<sid>` (base64), `term:exit:<sid>` (`session closed` | `exit N` | `connection lost: …`),
`prompt {id, kind: hostkey|passphrase|password|conflict, alias, msg, secret}`, `transfer:update`, `forward:update`,
`exec:<runId> {alias, data|done, exit, err | all}`.

### Mechanics worth knowing

- **No shell hook** (removed after v0.23): typing a hook at login left it in the server's history. Gone with it: file panel ↔ shell directory sync, session-restore `cd`, exit codes, long-command toasts, star-the-last-command prefill. Runbooks type steps up to the next Confirm as one `a && b` line; ⌘R records what Spean typed.
- **Sessions**: `Session.sid` = backend tab id; a `TermTab` holds N sessions (split panes). `pendingCd[sid]` = cwd to restore or `"\0"+cmd` to type at the first prompt (`openCmd` for container shells/logs).
- **Shared logins**: `sshx.clients` pool keyed by route (`user@addr>` per hop), refcounted; dead entries redialled. Second tab through the same bastion = no auth.
- **Auth order**: agent (matching key first when an identity is explicit) → identity files (vault passphrase, then prompt) → vault password → password prompt ×3 → keyboard-interactive ×3. Host keys always verified; changed key = hard fail with the `known_hosts` line number.
- **Auto-reconnect** only on `connection lost`, backoff 2/4/8/16/30 s, Enter forces.
- **Layout**: grid `[sidebar][main][right]`; sidebar full/icons/hidden (`⌘B`); right slot Files/Docker/Ports/Notes, resizable, width persisted; terminals refit via `ResizeObserver` — never dispatch synthetic resize events. `dark` class lives on `<html>`; components must not hardcode it. macOS hides the title bar: chrome has `--wails-draggable: drag`, clickable things `no-drag`.
- **Keymap**: ⌘K palette · ⌘R history · ⌘⇧F files · ⌘⇧D docker · ⌘⇧P ports · ⌘⇧N notes · ⌘B sidebar · ⌘D / ⌘E split · ⌘W close pane · ⌘F find · ⌘S save · ⌘⇧S star · ⌘1–9 favorites · ⌘L lock · ⌘, settings. Labels from `lib/keys.ts` (`⌘` / `Ctrl+`); handlers accept either modifier.
- **WKWebView has no `alert/confirm/prompt`** — every question is a dialog component.

### Run / verify

```bash
make setup · make dev · make build (ad-hoc signed) · make check test · make cross-check · make gen · make build-all · make build-linux
```

**Manual checks** (none automated; do them on real hosts before calling anything v1.0):
connect direct; connect through 2 bastions and watch per-hop progress; open a second tab to the same host (should not prompt — pool); kill the network → auto-reconnect countdown; click a folder → shell `cd`s; `cd` in shell → pane follows; `vim` open + click folder → "shell busy"; drag a file remote→remote; Finder drop onto a folder row; edit a root-owned file → Save with sudo; ★ last command; `⌘1`; `⌘R` shows the command; create vault, Remember a password, relaunch with keychain on; generate key + Install on host; Ports pane → Forward & open; Docker socket toggle → `docker context use spean-<label>`; multi-exec on a group; runbook with a failing step; split + broadcast; export → import on a clean data dir; Windows build: agent pipe, Docker npipe, `Ctrl+` labels; Linux build launches.

### Known gaps / deliberate shortcuts (`ponytail:` comments mark them in code)

- No end-to-end test. No sshd in CI either — a docker-based sshd smoke test in `build.yml` would be the highest-value addition.
- Transfer concurrency applies at next launch; `Job` fields read without a lock (stale tick, nothing worse).
- Tab-bar chip shows hop progress only while connecting; the status row is gone.
- No OSC 133 A/B/C markers; command timing uses Enter-at-prompt → D, so a command typed while not at prompt has no duration.
- Split layout: one direction per tab, not nested; restore keeps host + cwd, not the split.
- SOCKS5: CONNECT only. Docker bridge: unix socket / npipe only.
- Local terminal: unix only (creack/pty). Windows would need ConPTY.
- `history.jsonl` unbounded; search reads it all.
- Login hook is visible for a frame before `clear` on slow hosts.
- macOS ad-hoc signed only (right-click → Open once; Homebrew avoids it). Windows unsigned. Paid signing deferred until it earns its $99.

### What we can do more (ranked by value / cost)

1. **sshd-in-Docker integration test** in CI: connect, hop through a second container, run the hook, cd-sync, transfer a file. Turns "never run" into "run on every push".
2. **ConPTY local terminal on Windows** (`github.com/UserExistsError/conpty`), then remove the platform gate.
3. **Nested splits** (tree layout) + restore the split layout.
4. **Transfer resume** for interrupted big files (SFTP `OpenFile` with `O_APPEND` + offset).
5. **"Diff two hosts"**: multi-exec output side by side with line highlighting (config drift).
6. **Bastion health**: ping/`uptime`/`df` on hover in the sidebar via a cached `Exec` (needs a live tab or a pooled login).
7. **Tag-based dynamic groups** and saved multi-exec target sets.
8. **Per-host env/commands on connect** beyond the snippet (e.g. `tmux attach || tmux new` toggle).
9. **Kubernetes panel** on the Docker panel pattern (`kubectl get … -o json` over the chain) — big, only if users ask.
10. **i18n** — the app name is Khmer; a Khmer/English toggle would be on-brand and cheap with the current string layout (all strings inline; needs an extraction pass).
11. **Notarised macOS + SignPath Windows** once downloads justify it.
12. **Landing page** — now Part 3 (pbunnet.com, `/apps/spean`).

---

## Part 2 — Roadmap

Product goal: a better Termius. Not more features, but the SSH tasks people actually google (copy a key to a server, forward a port, keep a session alive, run one command on ten hosts, edit a root-owned file) made into one click or one palette entry. Every version below is scoped to ship on its own. Keep the ladder: reuse what exists, prefer stdlib/native, smallest diff that works.

### Data durability (applies to every version from v0.5 on)

Users will update, reinstall, or drag a new `.app` over the old one. Their hosts, vault, and settings must survive all of that.

- **Nothing user-owned lives inside the app bundle or `build/`.** All state goes under the OS config dir: `~/Library/Application Support/spean/` on macOS, `$XDG_CONFIG_HOME/spean/` on Linux, `%AppData%\spean\` on Windows. `os.UserConfigDir()` already does this for `hosts.json`; keep every new file there.
- **Every on-disk format carries a version.** `hosts.json` gets a top-level `{"version": 1, "hosts": [...]}` wrapper (migrate the current bare array on first read). The bbolt vault stores `meta/schema` and `meta/kdf`. Settings file too.
- **Migrations are forward-only, idempotent, and run at startup** in `internal/store/migrate.go`. Each migration: read old, write new, keep a `.bak` of the old file next to it until the next successful launch. Unknown *newer* version → refuse to start with a clear message instead of corrupting data (downgrade protection).
- **Never change a format in place without a migration.** Add a test that loads a fixture file from each previous version.
- **Export / import.** Settings → "Export everything" writes one JSON (hosts, settings, and the vault as an opaque encrypted blob) for backup or moving machines. Import merges by label.
- **Vault key material is machine-independent** (argon2id from the master password, salt stored with the vault), so the vault file can be copied to another computer and unlocked with the same password.
- **`~/.ssh/config` and `known_hosts` stay untouched** except appending accepted host keys, so nothing Spean does can break plain `ssh`.
- **Uninstall is just deleting the app**; the data dir stays unless the user removes it. Say so in the README.

### Design direction (applies to every version)

The bar: someone opens Spean for the first time and connects through two bastions in under a minute without reading anything. Modern means restraint, not decoration.

**Principles**
1. **One screen.** Hosts on the left, tabs on top, terminal in the middle. Everything else (files, transfers, favorites, settings, palette) slides in over that screen and slides away. No second window, no wizard pages except first run.
2. **Progressive disclosure.** Defaults are right; advanced fields sit behind "More" in the host editor. A new user sees Address, Label, User. Jump chain, agent forwarding, snippet, favorites appear when opened.
3. **Keyboard first, mouse complete.** Every action has a shortcut and a palette verb; every action is also reachable by click. The palette (`⌘K`) is the primary navigation, not a bonus.
4. **Motion with purpose.** Animation shows where something came from or went to (tab underline, pane slide, palette blur-in). Never decorative loops on screen while the user is working. Respect `prefers-reduced-motion`.
5. **Quiet chrome.** No borders where spacing does the job. Terminal is the hero; everything around it is a shade of the background.
6. **Feels native.** macOS traffic lights inset in our own title bar, system font for UI, real menus, standard shortcuts (`⌘T` new tab, `⌘W` close, `⌘1-9`, `⌘,` settings).

**Design system** (`frontend/src/index.css` tokens + shadcn)
- **Layout.** Hidden title bar (`Mac.TitleBar: TitleBarHidden()` in `frameless_darwin.go`; never `Frameless: true`, which removes the traffic lights); the tab bar lives in the title-bar strip with `--wails-draggable: drag` on empty space. Sidebar has three widths: hidden, icons only (host initials + colour dot), full (`⌘B` cycles). Content area is a CSS grid: `[sidebar] [main] [right-pane]`, right pane for files/transfers, bottom drawer for the transfer queue.
- **Colour.** One accent from the logo (`#38bdf8` → `#2563eb` gradient reserved for the active tab underline, primary buttons, and hop progress). Neutral scale from shadcn `neutral`. Dark is the default theme; light and system available in v0.7 settings. Terminal themes ship as a handful of presets (Spean Dark, Solarized, GitHub Light) that also retint the UI accent so the two never clash.
- **Type.** UI: system font stack (SF on macOS). Terminal and paths: `JetBrains Mono` bundled (fallback Menlo). Sizes: 13 px UI, 12 px meta, terminal from settings.
- **Spacing and shape.** 8 px grid. Radius 8 for controls, 12 for panels, 24 for the palette. Elevation via `backdrop-blur` and a 1 px `white/10` ring, no drop shadows on the main surfaces.
- **Icons.** lucide only, 16 px in rows, 20 px in headers, stroke 1.5.
- **Motion tokens.** 150 ms ease-out for opacity/colour, 200–250 ms spring (`motion` `type: 'spring', bounce: 0.15`) for layout moves. Nothing above 400 ms.
- **States.** Every list row and button has hover, active, focus-visible (2 px accent ring), and disabled. Every async action has a loading state in place (button spinner, chip pulse), never a full-screen blocker except the connection loader.
- **Empty states** carry the next action: no hosts → "Import from ~/.ssh/config" and "Add host"; no tabs → the dotted grid with `⌘K`; empty folder → "Drop files here"; no favorites → "★ Star your last command".
- **Errors** are sentences with a next step (see v0.9 table), shown inline where they happened, never as a generic toast.
- **Accessibility floor.** Contrast ≥ 4.5:1 for text, focus order matches visual order, all dialogs trap focus and close on Esc, terminal remains screen-reader-accessible via xterm's accessibility mode toggle in settings.

**UI work per version** (in addition to the features already listed) — mostly delivered in v0.12; remaining: Windows/Linux custom title bar (v0.13/v1.0), Figma mockups were skipped.
- v0.5: breadcrumb bar, context menus, the right-pane slide-in, `⌘B` sidebar states, frameless title bar.
- v0.6: dual-pane layout, drag ghosts that show file count and target, transfer drawer with per-job bars.
- v0.7: favorites chip strip, settings dialog with live preview, theme presets, light mode, host editor split into Basic / More.
- v0.8: server list redesign (tree, colour labels, status dots, card view), first-run onboarding (three screens: import, jump-host diagram, done), vault unlock screen.
- v0.9: forwards drawer, error cards with "Test connection".
- v0.10: verb palette redesign (sections: Hosts, Actions, Favorites, Recent), split-pane dividers, broadcast warning stripe.
- v0.11: Docker panel tables with health colours, task → node hop flow.
- v1.0: Windows/Linux custom title bar, platform-correct shortcuts (`Ctrl` for `⌘`), app icon set for each platform.

**Process.** Before each version's UI work, produce a one-page mockup (Figma, or a Claude Design canvas from this repo) for the new surface, agree on it, then build. Keep a `docs/ui/` folder with the accepted mockups so the next person sees the intent, not just the code.

### v0.5 — Click to `cd`: panel and shell share one working directory ✅ (2026-09-21)

Shipped as specified except: no `SftpStat` (nothing needed it), no double-click-file-types-name, migration lives in `store.go` not `internal/store/migrate.go` (one migration, one file), `.bak` is kept rather than removed on next launch.

Goal: stop typing `ls` and `cd`. Click a folder in the panel, the shell moves there, you type your command in that directory. Move in the shell, the panel follows.

**Panel → shell.**
- Single click on a folder enters it in the panel *and* sends `cd '<abs path>'` + Enter to the tab's PTY (`Write(id, ...)`). Path is single-quoted with `'` escaped as `'\''`.
- Only send when the shell is known to be at a prompt (see below). Otherwise just navigate the panel and show a small "shell busy" hint; never type into a running `vim`.
- Breadcrumb path bar, each segment clickable, same behaviour. Keep an "edit path" toggle for typing.
- Single click on a file selects; double click downloads (unchanged). Optional: double click on a file also types its quoted name into the shell after the cursor, so `cat <click>` works.

**Shell → panel (cwd tracking).**
- Use OSC 7, the standard "current directory" escape (`ESC ] 7 ; file://host/path BEL`). Terminal.app and iTerm use the same mechanism.
- The startup snippet already types into the shell after login; prepend a shell-agnostic one-liner that installs a prompt hook:
  ```sh
  case "$0$BASH$ZSH_NAME" in *zsh*) precmd(){ printf '\e]7;file://%s%s\a' "$HOST" "$PWD"; };; *) PROMPT_COMMAND='printf "\e]7;file://%s%s\a" "$HOSTNAME" "$PWD"'"${PROMPT_COMMAND:+;$PROMPT_COMMAND}";; esac; clear
  ```
  Per-host toggle (`Track directory`, default on) so it can be disabled for `sh`, `fish`, restricted shells, or servers where typing at login is unwanted.
- In `Term.tsx`, `term.parser.registerOscHandler(7, ...)` parses the path, stores it as the tab's `cwd`, and marks `atPrompt = true`. Any keypress that is not Enter at the prompt sets `atPrompt = false` until the next OSC 7. This is the guard used by panel → shell.
- File panel listens to `cwd` and re-lists when it changes and the user has not navigated away manually. A "follow shell" toggle in the panel header switches between synced and free browsing.
- Fallback when no OSC 7 arrives within a few seconds of login: panel behaves as today (free SFTP browsing, no `cd` injection), with a one-line hint.

**Panel polish that comes along.**
- Back / forward history per tab.
- Columns: name, size, modified, permissions; click header to sort.
- Right-click context menu (shadcn `dropdown-menu`): Open, `cd` here, Download, Rename, Delete, New folder (with a name dialog), Copy path, Paste path into shell.
- Hidden files toggle.

**Backend additions.** `SftpRename`, `SftpStat`. `cd` injection and OSC parsing are frontend only; the tracking one-liner is assembled in `config.Hop`/`session.Options` next to the existing snippet. `hosts.json` gains the version wrapper here (first migration).

### v0.6 — Transfers: drag and drop between anywhere ✅ (2026-09-21)

Shipped as specified except: no "Reveal in pane" in the drawer; concurrency fixed at 2 until settings exist; `Download` picks a folder (not a filename) so multi-select works through the engine.

Goal: move files local ↔ server and server ↔ server by dragging, regardless of how many hops sit in between. Today only Finder → panel works.

**What WKWebView allows.** Files can be dragged *in* from Finder (Wails `OnFileDrop`, already used). Files cannot be dragged *out* to Finder: WKWebView has no file-promise support and Wails v2 does not bridge it. So "server → local" cannot end in Finder; it ends in a **local pane inside Spean**. Everything between two panes is plain HTML5 drag-and-drop, which is fully under our control.

**Dual-pane file manager** (Transmit / Cyberduck layout), replacing the single v0.4 panel:
- Two panes side by side, toggled with the folder icon or `⌘⇧F`. Each pane has a source picker: **Local** or any connected tab (`kind: 'term'`), shown by host label. Same pane component either way; only the backend differs.
- Local pane backend: `LocalList`, `LocalHome`, standard `os` calls. Remote pane backend: the existing `Sftp*` methods keyed by tab id.
- Each pane keeps its own path, history, sort, and (for remote panes) the v0.5 shell-follow toggle.
- Drag sources: rows in either pane, or Finder. Drop targets: the other pane's folder rows or its background (= current directory). Drag data is JSON `{source: 'local' | tabId, paths: [...]}` in `dataTransfer`; Finder drops keep arriving through `OnFileDrop` with the pane under the cursor as target.
- ⌘-drag = move (copy then delete source on success), plain drag = copy. Shown in the drop hint.
- Keyboard fallback: select rows, `⌘C` / `⌘V` across panes.

**Transfer engine** (`internal/transfer`):
- One job per drop: `{id, from: {src, path}, to: {src, dir}, recursive, policy}`. Jobs run in a queue, 2 concurrent by default (setting).
- Copy paths, all streamed through the local machine, never through a hop's disk:
  - local → remote: `os.Open` → `sftp.Create`
  - remote → local: `sftp.Open` → `os.Create`
  - remote → remote: `sftpA.Open` → `sftpB.Create` (the `scp -3` model; works across unrelated chains because both clients live here)
- Directories: walk source (`filepath.Walk` / `sftp.Walker`), create target dirs first, then files. Preserve mode bits; preserve mtime with `Chtimes` where supported.
- Progress: counting writer around `io.Copy`, event `transfer:progress` `{jobId, file, done, total, bytesPerSec}` throttled to ~4/s. Cancel via `context.Context`; partial target file removed on cancel.
- Conflict policy asked once per job when the first collision is found: Overwrite, Skip, Rename (`name (1).ext`), Overwrite if newer, applied to the rest.
- Symlinks: copy the link target's content (like `cp -L`); note it in the job log. Special files skipped with a warning.
- Errors do not abort the job; they mark the file and continue. Retry button re-runs failed files only.

**Transfers drawer** at the bottom of the window (collapsible): per job a row with direction, host(s), file count, bar, speed, ETA, cancel/retry, "Reveal in pane". Persist finished jobs for the session only.

**Backend additions.** `LocalList`, `LocalHome`, `Transfer(job) jobId`, `TransferCancel(jobId)`, `TransferRetry(jobId)`, events `transfer:progress`, `transfer:done`. The v0.4 `SftpUpload`/`SftpDownload` become thin wrappers over the engine.

### v0.7 — Favorite commands, editor, terminal quality, settings ✅ (2026-09-21)

Shipped as specified except: no OSC 133 A/B/C markers (D plus a private OSC 7770 carrying the last command was enough for "star the last command"); global snippets wait for v0.10; transfer concurrency applies at next launch.

Goal: the commands you run on a given server are one click away; a nano/vim alternative that also handles root-owned files; the terminal niceties a daily driver needs.

**Favorite commands per host.** The problem: the same five commands on the same server, found by scrolling shell history every time.
- Data: each host gets `favorites: [{name, cmd, run}]`. Saved hosts keep it in their record. Hosts that only exist in `~/.ssh/config` get a side record in `hosts.json` keyed by alias (`meta: {"<alias>": {favorites: [...]}}`), so the config file is never written.
- UI: a chip strip between the tab bar and the terminal for the active tab. Click a chip types the command into the shell; `run: true` also presses Enter, `run: false` leaves it on the prompt to edit. `⌘1`…`⌘9` trigger the first nine. Only fires when `atPrompt` (the OSC guard from v0.5); otherwise the chip shakes and nothing is typed.
- Capture without retyping, three ways:
  1. **Star the last command.** Extend the v0.5 login hook to also emit OSC 133 prompt markers (`ESC ] 133 ; A` prompt start, `B` input start, `C` command start, `D ; <exit>` done). This is the shell-integration protocol iTerm2, VS Code, and WezTerm use. Between `B` and `C` the buffer line is exactly what the user typed; `Term.tsx` keeps the last N. A `★` button (or `⌘⇧S`) opens a small dialog prefilled with the last command: name, run-on-click, save.
  2. **Import from remote history.** Read `~/.zsh_history` / `~/.bash_history` / `~/.local/share/fish/fish_history` over the tab's SFTP client, dedupe, rank by frequency, show a picker with search; star what you want. Strip zsh's `: <ts>:0;` prefix.
  3. Type it in the host editor (a small list editor in the Connection section).
- Placeholders: `{{name}}` inside a command prompts for a value in an in-page dialog before typing (`docker logs -f {{container}}`). Values remembered per host for the session.
- Palette: ⌘K lists favorites of the active host as "Run *deploy* on prod-web".
- Global snippets (v0.10) are the same structure with no host; a host favorite with the same name shadows the global one.
- **Favorite packs.** Bundled presets enabled per host with one toggle each (`Docker`, `Swarm`, `Git`, `systemd`). They are ordinary favorites, just pre-written; users can edit or delete individual entries after enabling. Packs live in `frontend/src/packs/*.json`.
  - *Docker*: `docker ps`, `docker logs -f --tail 200 {{container}}`, `docker exec -it {{container}} sh`, `docker compose up -d`, `docker compose logs -f`, `docker system df`, `docker image prune -f`.
  - *Swarm*: `docker service ls`, `docker service ps {{service}} --no-trunc`, `docker service logs -f --tail 200 {{service}}`, `docker service scale {{service}}={{replicas}}`, `docker service update --force {{service}}`, `docker stack deploy -c {{dropped}} {{stack}}`, `docker stack ps {{stack}}`, `docker node ls`.
  - *Git*: `git status`, `git pull --ff-only`, `git log --oneline -20`, `git diff --stat`, `git checkout {{branch}}`.
  - *systemd*: `systemctl status {{unit}}`, `sudo systemctl restart {{unit}}`, `journalctl -u {{unit}} -f -n 200`.
- **Drop-to-run.** A favorite containing `{{dropped}}` accepts a file dropped onto its chip (Finder or a pane from v0.6): upload to `/tmp/spean-<rand>-<name>` through the transfer engine, substitute the remote path, ask for any other placeholders, type the command. `docker stack deploy -c {{dropped}} {{stack}}` becomes: drag the compose file, type the stack name, deployed. Temp files are removed after the command's OSC 133 `D` marker arrives, or on tab close.
- Hosts tagged `git` default agent forwarding to on, with a one-time explanation of what forwarding exposes.


**Editor.**
- **CodeMirror 6** (`@codemirror/*`, `@codemirror/language-data` for lazy syntax packs). Lighter than Monaco, fine in WKWebView, MIT.
- Open from the file panel (double click on text files or context menu). Tab model becomes `{kind: 'term' | 'editor' | 'local', ...}`.
- Backend: `SftpRead(id, path)` with a 5 MB cap (larger → read-only or refuse with a clear message), `SftpWrite(id, path, content)` writing to a temp file then `Rename` for atomic save.
- Dirty indicator on the tab, ⌘S saves, in-page dialog before closing a dirty tab. Preserve line endings. Refuse binary (NUL byte).
- **`sudo` save.** If `SftpWrite` fails with permission denied: write to `/tmp/spean-<rand>` over SFTP, then type `sudo mv /tmp/spean-<rand> '<path>'` + Enter into the tab's shell (only when `atPrompt`, from v0.5). The password prompt happens in the terminal like normal. Offer this in the error dialog as "Save with sudo".

**Terminal.**
- xterm addons: `@xterm/addon-search` (⌘F bar), `@xterm/addon-web-links`, `@xterm/addon-unicode11`, `@xterm/addon-clipboard` (OSC 52 so remote copy lands in the local clipboard).
- Broadcast-safe paste: warn on multi-line paste (bracketed paste is already on by default in xterm).

**Settings.** One dialog, one `settings.json` (versioned): font family/size, theme (a few presets + custom colours), scrollback, cursor style/blink, bell, default shell tracking on/off, keepalive interval, confirm on close. Apply live to open terminals.

### v0.8 — Vault, key manager, server list ✅ (2026-09-21)

Shipped as specified except: storage is an encrypted JSON file (`internal/vault`), not bbolt — same guarantees, no new dependency; OS-keychain caching of the vault key not built (setting would default off anyway); "Test connection" lands in v0.9.

Goal: optionally remember secrets, make keys a one-click affair, and make the host list something you want to look at.

**Storage.** RocksDB is the wrong tool: CGO, tens of MB, tuned for write-heavy workloads. This is a few hundred small records. Use **`go.etcd.io/bbolt`** — pure Go, single file, ACID, zero config. Buckets: `hosts`, `secrets`, `keys`, `settings`, `meta`. Migrate `hosts.json` into it on first launch (keep the `.bak`). `~/.ssh/config` stays read-only as before.

**Encryption.** Vault key from a master password with `argon2id` (`golang.org/x/crypto/argon2`), secrets encrypted with `XChaCha20-Poly1305` (`golang.org/x/crypto/chacha20poly1305`). Salt and parameters in `meta`. Master password asked once per launch; derived key lives in memory only. ⌘L locks (drops the key, keeps sessions).
- Optional: cache the vault key in the OS keychain via `github.com/zalando/go-keyring` so launch does not prompt. Setting, default off.
- Secrets per host: password, key passphrase, or an imported private key (PEM). `sshx.authMethods` checks the vault before prompting; on a successful prompt the dialog offers a "Remember in vault" checkbox.
- Never write decrypted material to disk. Never log it. `ponytail:` comments on every path secrets flow through.

**Key manager.**
- List keys: from `~/.ssh` (read-only, public part shown) and from the vault.
- Generate ed25519 (`crypto/ed25519` + `ssh.MarshalPrivateKey`), optional passphrase, save to `~/.ssh/<name>` or into the vault. Copy public key button.
- **Install on host** (`ssh-copy-id` equivalent): with a tab open to the host, `mkdir -p ~/.ssh && chmod 700 ~/.ssh`, append the public key to `~/.ssh/authorized_keys` if not present, `chmod 600`. Do it over SFTP (no shell typing needed). Then set the host's key to the new one and offer "Test connection".
- Host editor key field becomes a picker over known keys instead of a free-text path.

**Server list UI.**
- Collapsible group tree with persisted collapsed state; drag to reorder within a group.
- Host rows: colour label, favourite star, tag chips, last-connected timestamp, status dot (connected / connecting / error) fed from tab state.
- Right-click: Connect, Connect in new tab, Edit, Duplicate, Delete, Copy `ssh` command, Copy public key to this host.
- Card/grid view toggle; same data.
- Search matches label, hostname, user, group, tags; Spotlight reuses the filter.
- Import wizard: parse `~/.ssh/config` entries into vault hosts on demand (they stay read-only unless imported).
- First run: detect `~/.ssh`, offer import, one-screen explanation of jump hosts with the bridge diagram. Onboarding is part of the product.

### v0.9 — Port forwarding, local terminal, error explanation ✅ (2026-09-21)

Shipped as specified. SOCKS5 is ~60 lines in `internal/forward` (CONNECT only, no dependency). Windows named pipe for the Docker bridge stays in v1.0.

**Port forwarding.**
- Local (`-L`), remote (`-R`), dynamic SOCKS (`-D`). Backend: `client.Listen` / `client.Dial` over the target client of a tab, plus a small SOCKS5 handler for `-D` (`golang.org/x/net` has none; ~150 lines or `github.com/armon/go-socks5`).
- Saved per host (start on connect: on/off). Active-forwards drawer with status, bytes, stop button, and "Open in browser" for local forwards.
- Palette verbs: "Forward port …" prefilled with the current host.
- **Docker socket over SSH.** Per-host toggle *Docker socket*. On connect, Spean opens `client.Dial("unix", "/var/run/docker.sock")` per incoming connection on a local listener at `<data dir>/sock/<label>.sock` (`direct-streamlocal@openssh.com`, supported by `x/crypto/ssh`). The host row then shows a Docker badge with **Copy `DOCKER_HOST`** (`export DOCKER_HOST=unix:///…/<label>.sock`) and **Create docker context** (`docker context create spean-<label> --docker host=unix:///…`). Local `docker`, `docker compose`, `lazydocker`, and the VS Code Docker extension then operate on the remote daemon through the full hop chain. `docker -H ssh://` cannot do multi-hop without matching ssh config; this can. Remote socket path is editable (rootless Docker, Podman). Windows: named pipe instead of unix socket in v1.0.

**Local terminal tab.** Part 0 calls a full local terminal a non-goal; a single local tab is not that. `github.com/creack/pty` running the user's `$SHELL`, same `Term` component, `kind: 'local'`. Makes `scp`, `ssh-keygen`, git, and the local side of anything available without leaving the app.

**Error explanation.** Replace raw Go errors on a failed hop with a classified message and a next step:

| Symptom | Shown as |
|---|---|
| DNS failure | "`bastion.example` does not resolve. Check the hostname or your VPN." |
| connection refused | "Nothing is listening on `10.0.0.5:22`. Wrong port, or sshd is down." |
| i/o timeout | "No route to `10.0.0.5:22` after 15 s. Firewall or VPN?" |
| host key mismatch | "Host key for `…` changed. If you reinstalled the server, remove the old line from `known_hosts`. If not, stop." (offer the exact line number) |
| auth failed | "Server refused agent key, `id_ed25519`, and password. It accepts: `publickey`. Install a key with Key Manager → Install on host." |

Plus a **Test connection** button in the host editor that runs the chain without opening a shell and reports per hop.

### v0.10 — Many hosts at once, and the verb palette ✅ (2026-09-21)

Shipped as specified. Split layout is one direction per tab (row or column), not nested; session restore keeps host + cwd, not the split layout.

- **Multi-exec.** Select N hosts (checkboxes in the list or a saved "target group"), run one command, outputs in a grid or stacked with host headers. Backend: `Exec(ids[], cmd)` streaming per-host output events. Reuses chains from open tabs; opens temporary ones otherwise.
- **Broadcast input.** Toggle on 2+ tabs; keystrokes go to all of them (Termius "multi-tab input"). Visual warning stripe while active.
- **Split panes.** Two or more terminals in one tab, horizontal/vertical, drag divider. Each pane is a normal session.
- **Snippets.** Saved commands with optional placeholders (`{{env}}`), a side drawer, click to type into the active terminal or run via multi-exec.
- **Verb palette.** ⌘K becomes an action palette, not just hosts: "Connect to …", "Forward port … from …", "Copy public key to …", "Upload file to …", "Run snippet … on …", "Open files for …", "Lock vault". Every feature reachable from one search box.
- **Session restore.** Reopen the same tabs (hosts, cwd, split layout) on next launch; ask once, remember the answer.
- **Session logging.** Per-tab "Log to file" with timestamps, under the data dir.
- **Cluster groups.** A group can be marked as a cluster (`kind: swarm`). Roles (manager/worker) and node IDs are detected from `docker node ls --format '{{json .}}'` on any member and cached. Multi-exec targets a cluster by name; "Run on a manager" picks a reachable manager automatically; the node list offers `docker node update --availability drain|active {{node}}`. Hostnames from `docker node ls` are matched to Spean hosts by label, `HostName`, or a manual mapping stored on the group. This mapping is what v0.11's task-to-node hop relies on.

### v0.11 — Docker & Swarm ✅ (2026-09-21)

Shipped as specified. `ExecStream` not needed (logs run in normal tabs). Split-below moved to `⌘E` so `⌘⇧D` is the Docker panel.

Goal: the day-to-day Swarm loop (which service is unhealthy, where is its task running, get a shell there, tail its logs) without leaving Spean and without a second tool. Not a Portainer: no create/edit forms; every action is a real `docker` command the user could have typed, shown before it runs.

**Docker panel** (right pane, next to files; `⌘⇧D`)
- Tabs: Services, Tasks, Nodes, Stacks, Containers. Each is a table fed by `docker … --format '{{json .}}'` executed over the tab's chain via a non-PTY `Exec` (new backend method, also reused by multi-exec). Refresh button and an interval (off / 5 s / 30 s). Works on plain Docker hosts too (Containers tab only).
- Row actions are the v0.7 pack favorites, prefilled with the row's id/name: Logs, Shell, Restart/Force update, Scale, Inspect (opens `docker inspect` JSON in a read-only editor tab from v0.7), Remove (confirm dialog shows the exact command).
- Health at a glance: replicas `2/3` in amber, `0/3` red, task state `Failed` red with the error column from `service ps --no-trunc`.

**Container shell and log tabs**
- **Shell**: new tab, same chain, runs `docker exec -it <id> sh -c 'command -v bash >/dev/null && exec bash || exec sh'`. Tab label `<host> › <container>`.
- **Logs**: new tab running `docker service logs -f --tail 200 <svc>` or `docker logs -f --tail 200 <container>`; xterm search from v0.7; a pause toggle that stops rendering without killing the stream; clear buffer.

**Task → node hop** (the part no other client does)
- In Swarm, `service ps` shows the node each task runs on. If that node resolves to a Spean host (cluster mapping from v0.10), "Shell into task" opens a tab to *that node* through its own hop chain and runs `docker exec` on the task's container id (`docker ps -q --filter label=com.docker.swarm.task.id=<task>`). Same for "Logs on node" when the service uses a non-json log driver and `service logs` is empty.
- If the node is unknown, offer "Add node as host…" prefilled with the hostname and the current host's jump chain.

**Published ports → forward**
- Containers/Services tables parse `0.0.0.0:8080->80/tcp`. Click a port: start a local forward (v0.9) to that published port on the node and open `http://localhost:<port>` in the browser. Stop from the forwards drawer.

**Backend additions.** `Exec(id, cmd) (stdout, stderr, exit)` non-PTY over an existing tab; `ExecStream` for logs when not using a tab. Everything else is favorites, tabs, and forwarding already built.

### v0.12 — Layout & UX ✅ (2026-09-21)

Right slot (Files/Docker) resizable + responsive, sidebar rail, frameless macOS, empty state, tokens, light mode, refit bug fixed at the root. See CHANGELOG.

### v0.13 — Host editor & route builder ✅ (2026-09-21)
### v0.14 — Windows runtime + CI ✅ (2026-09-21)
### v0.15 — Connection engine ✅ (2026-09-21)
### v0.16 — Command history & selection actions ✅ (2026-09-21)
### v0.17 — Export / import, backups, config editor ✅ (2026-09-21)

Details in CHANGELOG. Files: `internal/sshx/pool.go` (shared logins), `history.go` (`history.jsonl`), `export.go` (bundle), `frontend/src/components/HistoryPalette.tsx`, `HostEditor.tsx` (route builder), `lib/keys.ts` (`MOD` label).

### v0.18 — Files power ✅ · v0.19 — Attention ✅ · v0.20 — Notes/themes/keychain ✅ · v0.21 — Runbooks ✅ · v0.22 — Ports ✅ (2026-09-21)

Files: `files.go` (CountTree/DeleteTree/Chmod/SearchFiles/ReadPreview/DiskUsage), `forward.go` `ListenPorts` (+ `ports_test.go`), `history.go`, `export.go`; frontend `Toasts.tsx`, `NotesPane.tsx`, `PortsPane.tsx`, `Runbooks.tsx`. Right slot tabs: Files · Docker · Ports · Notes (`⌘⇧F/D/P/N`). Term hooks: `onActivity`, `onLongDone`, `onCommand`, `onSelectionMenu`, `themeName`. Keychain via `go-keyring` (`VaultAutoUnlock` at launch when the setting is on).

### v0.23 — Public repo & release pipeline ✅ (2026-09-21)

AGPL-3.0; `release.yml` on tags; ad-hoc macOS signing; Homebrew cask + winget manifests generated per release (`packaging/`); opt-in update check (`version.go`).

### v1.0 — Verified release  ← gate, not features

v1.0 means: the manual checklist in Part 1 passed on real hosts on macOS, Linux and Windows; a CI sshd smoke test exists; notarised macOS build and signed Windows build (or a documented decision not to). Nothing else is required. Already done from the original v1.0 list: Windows/Linux builds, Windows agent via go-winio, opt-in update check, bastion connection sharing. Still open: signing/notarisation (see `packaging/README.md`), release checklist with migration fixtures from each previous `hosts.json` version (only v1 exists so far).

## Part 3 — Portfolio site: pbunnet.com

Separate repo (`P-Bunnet/pbunnet.com`), not inside this one. Spean stays a product; the site is the person. Decided: Next.js (App Router, static export where possible), Tailwind, deployed on Vercel or Cloudflare Pages; domain `pbunnet.com` (to buy). Spean's own URL: `pbunnet.com/apps/spean`, with `spean.pbunnet.com` as a redirect to it (one site to maintain; a `docs.` subdomain only if docs ever exceed ~20 pages).

### Sections

1. **Home** `/` — name, one line of who you are, three cards: Apps, Timeline, Contact. Same visual language as Spean (dark default, `#38bdf8 → #2563eb` accent, system font, quiet chrome). Spean logo reused.
2. **Apps** `/apps` — one card per app. `/apps/spean`: pitch, 4 screenshots (route builder, dual-pane files, Docker panel, ⌘K), platform download buttons that resolve to the latest GitHub release, install notes (Homebrew tap, right-click → Open, winget, SmartScreen), security paragraph (host keys, vault crypto, no telemetry), changelog rendered from the repo's `CHANGELOG.md`. Data: GitHub REST at build time (`/repos/P-Bunnet/Spean/releases/latest`, `raw.githubusercontent.com/.../CHANGELOG.md`); revalidate hourly via ISR or rebuild on a release webhook.
3. **Timeline** `/timeline` — the software-engineering journey as a vertical timeline: year/month, title, one paragraph, optional link/tag (school, first job, projects, Spean). Content in `content/timeline.yaml` or MDX so entries are a text edit, not a code change. Owner supplies the entries.
4. **Contact / footer** — GitHub, email (obfuscated), optional LinkedIn. No analytics beyond a privacy-friendly counter if any (Plausible/Umami), and say so.

### Build order

1. Buy `pbunnet.com`; set nameservers to the host (Vercel or Cloudflare).
2. `npx create-next-app@latest pbunnet.com --ts --tailwind --app`; add `content/` (timeline, apps), `lib/github.ts` (release + changelog fetch), `app/apps/spean/page.tsx`.
3. Screenshots: take them from a real session once the Spean smoke tests pass; store under `public/apps/spean/`.
4. Redirect `spean.pbunnet.com` → `/apps/spean` (host-level redirect rule).
5. Point Spean's README "Install" and the release notes footer at `pbunnet.com/apps/spean`.

### What the owner must provide

Timeline entries (date, title, text), a short bio, which links to show, and the four screenshots. Everything else is derivable from this repo.

## Part 4 — Assist: AI in the client (v0.24)

Off by default. Nothing leaves the machine until the user picks a provider. Two providers behind one interface; the features do not know which one answers.

### Providers

| | Local (Ollama) | Cloud (Claude) |
|---|---|---|
| Transport | `http://localhost:11434/api/chat` (plain `net/http`, no dependency); also any OpenAI-compatible server (llama.cpp, LM Studio) | `github.com/anthropics/anthropic-sdk-go`, Messages API, streaming, adaptive thinking |
| Models | `gemma3:4b` (fast, 3 GB), `gemma3:12b` (better, 8 GB), `qwen2.5-coder:7b` (best at shell commands) — user picks from `GET /api/tags` | `claude-opus-5` default; `claude-sonnet-5` as the cheaper pick, user's choice |
| Key / data | none; fully offline | API key stored in the vault (never plain on disk); user sees the exact context before it is sent |
| Good at | explain errors, summarise output, draft simple commands | multi-step diagnosis, exact commands for odd tools, tool-use loops |
| Cost | electricity | ~2k tokens in / 300 out per ask ≈ $0.02 on Opus 5 ($5 / $25 per MTok) |

`internal/ai`: `type Provider interface { Chat(ctx, req) (<-chan Delta, error) }` with `req = {System, Messages, Tools?}`; `ollama.go`, `claude.go`. Settings: `ai.provider: off|ollama|claude`, `ai.model`, `ai.endpoint` (Ollama URL). Per-host flag **No AI** for boxes whose output must never leave (skips cloud; local still allowed unless global off).

### Features, ranked

1. **Explain this** — select terminal text → right-click → *Explain* (or ⌘K verb on the last screen). Context: the selection or last ~80 lines of the buffer (`term.buffer.active`), host OS/shell (`uname -sr`, cached per tab), cwd, last command + exit code. Answer streams into a side card in the right slot ("Assist" tab). Local model handles this well.
2. **Fix it** — after a non-zero exit (OSC 133;D) an optional toast: *Fix `make build`?* → explanation + one proposed command. The command is **shown, never typed** until the user clicks Run (goes through `run()` like a favorite; a `sudo` or destructive verb — `rm -rf`, `dd`, `mkfs`, `> /dev/` — gets a red confirm).
3. **Ask for a command** (⌘⇧K): "find files over 1 GB changed this week" → command, one-line rationale, Run / Copy / Edit. Context: cwd, OS, favorites, recent history. Bundle the user's shell (`$SHELL`) so quoting is right.
4. **Draft a runbook / favorite** from a goal ("deploy this compose stack safely") → steps into the v0.21 Runbook editor, nothing runs.
5. **Diagnose Swarm/Docker** — from the Docker panel: failed task row → *Diagnose* sends `service ps --no-trunc` error + `service inspect` + last logs (200 lines) and asks for cause and next command.
6. **Agentic diagnosis** (Claude only, later): tool-use loop with one tool `exec_readonly(cmd)` limited to an allowlist (`df`, `free`, `systemctl status`, `journalctl -n`, `docker … ls/ps/inspect/logs`) and an approval gate per call (Go SDK `BetaToolRunner` hooks). Local models skip this.

### Rails (not optional)

- Never auto-run. Every command from the model renders as text with a Run button that goes through the at-prompt guard.
- Redact before sending: lines matching `password|passwd|secret|token|api[_-]?key|BEGIN .* PRIVATE KEY|AKIA[0-9A-Z]{16}` are replaced with `[redacted]`; vault contents and `~/.ssh` file bodies are never part of any context.
- Context preview: the Assist card shows exactly what will be sent (collapsed), with a "send less" toggle (selection only).
- Per-host **No AI**; global provider `off` kills every entry point (no verbs, no toasts).
- Cloud calls stream; a 15 s no-token timeout falls back to "provider slow" not a hang. Errors are sentences (no key, model not pulled, Ollama not running → `ollama serve` hint).
- README gains an "AI" section stating the above in plain words: opt-in, what is sent, where.

### Build order

1. `internal/ai` with the Ollama provider + settings + Assist tab + *Explain this* (offline first: no key, no money, proves the plumbing).
2. Claude provider (vault-stored key, `claude-opus-5`, streaming, adaptive thinking, `max_tokens` 4096) + provider picker.
3. *Fix it* toast + *Ask for a command* palette.
4. Runbook draft, Docker diagnose.
5. Agentic diagnosis behind a separate toggle.

Not doing: local model bundled in the app (users install Ollama; the app links to it), chat history sync, anything that reads files off the host without an explicit action.

## Working agreements for whoever continues

- Do not commit or push unless the owner says so. Everything since v0.5 is uncommitted in the working tree on purpose.
- Versions stay 0.x until the v1.0 gate above is met. Next feature version is v0.24 — Assist (Part 4).
- Read Part 0's security rules, then `internal/config`, `internal/sshx`, `app.go` before touching connection flow. Trace one `Connect` end to end.
- Any new user prompt goes through `PromptDialog` (WKWebView has no native dialogs).
- Regenerate bindings after changing bound method signatures; Wails only supports `(T, error)` returns.
- Keep `README.md` in sync with shipped features; tick boxes in this file as versions land.
