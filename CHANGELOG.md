# Changelog

All notable changes to Spean are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Version numbers below mirror the
milestones in `plan.md`.

## [Unreleased]

### Fixed
- Sidebar: the **+** button is now the same height as the search box and lines up with it.
- Windows showed the Wails logo instead of Spean's. The icon is now built from `build/logo.svg`, with transparent corners, which also removes the white corners from the macOS icon.
- Password logins failed with `Too many authentication failures` when the SSH agent held more keys than the server allows. Spean now reconnects without the keys and asks for the password, or uses the one in the vault.

## [0.24.0] — 2026-11-06

### Removed
- Login shell hook. Spean no longer types anything into the remote shell at login, so nothing of Spean's is left in the server's shell history. Gone with it: the **Track directory** setting and per-host toggle, file panel ↔ shell directory sync, `cd` back to the last directory on session restore, exit codes, "finished in N s" toasts, and prefilling ★ with the last command. Favorites, runbooks, palette and Docker actions now type whenever the tab is open, without checking for a prompt.

### Added
- **Keep out of shell history** for favorites, snippets and runbooks. These run in a separate non-interactive login shell instead of being typed, so nothing lands in the server's shell history. Output opens in a window with the exit code. Runbook steps get their own ✓/✗, stop at the first failure, and `cd` and `export` carry between steps. Sudo password prompts and full-screen programs do not work in this mode. On by default for new favorites and runbooks; existing ones stay typed until ticked.
- Creator credit in Settings and the README.
- 22 new themes: 10 classics (Dracula, Nord, Gruvbox Dark, Tokyo Night, One Dark, Monokai, Rosé Pine, Catppuccin Mocha and Latte, Solarized Light) and 12 playful ones (Bubblegum, Cotton Candy, Synthwave, Arcade, Phosphor, Amber CRT, Lava, Deep Sea, Banana, Mint Chocolate, Watermelon, Spooky). The global theme now retints the whole app, not only the terminal; **Spean Dark** looks as before. A per-host theme still changes only that host's terminal.
- Playful themes have their own art, with no new dependency: a backdrop behind the terminal, sidebar and empty screen (synthwave sun and grid, CRT scanlines and glowing text, starfield, bubbles, embers, moon, scattered icons), a mascot on tabs and the empty screen, and a change to the app's icons and corners (filled and round, blocky and square, or heavier). Backdrops are static. A terminal using a playful theme through a per-host setting gets its backdrop too.

- Release pipeline can sign the Windows exe through SignPath Foundation. It stays off until the project is approved and configured; see `packaging/README.md`.

### Changed
- CI takes its Go version from `go.mod`, which needs 1.26.
- Runbooks: steps up to the next Confirm are typed as one `a && b` line, so the shell stops at the first failure.
- Drop-to-run removes the uploaded file with `; rm -r <dir>` appended to the command.
- ⌘R history records the commands Spean typed (favorites, runbooks, palette), not every command run in the shell.
- Docker panel → Containers lists running containers (`docker ps`) by default; a **stopped too** checkbox switches to `docker ps -a`.

### Fixed
- Tall dialogs ran past the window, most visibly Settings under the monospace playful themes. Every dialog now scrolls inside the window; **Save** and **Cancel** in Settings stay in view.
- Launch: restored tabs connected before the vault was unlocked, so Spean asked for a server password it had stored, then for the master password. Connects now wait until the launch unlock is done or skipped.
- macOS: close, minimize and zoom buttons were missing. `Frameless: true` makes Wails drop the titled window style; the window now only hides its title bar. Tabs no longer sit under the buttons when the sidebar is in icons mode.
- Terminal bottom was cut off after shrinking the window: the root grid row could not shrink below the terminal's current height, so the terminal never refit. The last row could also clip at some sizes because padding sat on the element `FitAddon` measures.
- Host editor: **Add hop** did nothing. Hops were re-derived from the comma-joined `jump` string on every render, so an empty new hop was dropped before it could be filled in. Hops are now editor state; `jump` is built from them on save.

## [0.23.0] — 2026-09-21 — Public repo & release pipeline

### Added
- Licence: **AGPL-3.0**. Repository public at github.com/P-Bunnet/Spean.
- Release pipeline: pushing a `vX.Y.Z` tag builds macOS (universal, ad-hoc signed), Linux and Windows, attaches archives, `SHA256SUMS`, a filled Homebrew cask and winget manifests, and drafts the GitHub Release from this changelog. `packaging/README.md` explains the free distribution path (Homebrew tap, winget, SignPath).
- Opt-in **update check** (Settings → Updates): one request to the GitHub releases API at launch, a toast when a newer tag exists, nothing downloaded. "Check now" button. Version shown in Settings (`-ldflags -X main.version`).
- Bundle identifier `com.pbunnet.spean`; `make build` ad-hoc signs so Apple Silicon does not report the app as damaged.

### Changed
- README: install section for all three platforms, contributing notes, licence. Personal paths and email removed from the tree.

## [0.22.0] — 2026-09-21 — Ports

### Added
- **Ports pane** (`⌘⇧P`, right slot): every TCP listener on the host (`ss -ltnp`, `netstat` fallback) with bind address and process. **Forward & open** on web-looking ports (80, 3000, 8080, nginx, node, docker-proxy…), plain forward on the rest; active forwards show their local port with Open/Stop. Saved forwards for the host toggle Start/Stop from the same pane; other active forwards on the tab listed below.

## [0.21.0] — 2026-09-21 — Runbooks

### Added
- **Runbooks** (⌘K → Runbooks): named, ordered command lists typed into the active host's shell one step at a time. Each step waits for the previous one to finish (shell hook exit marker); a non-zero exit stops the run with Retry / Skip; steps marked *confirm* pause for you; `{{name}}` placeholders are asked once up front; notes show under each step. Stored in `hosts.json` (`runbooks`), exported/imported with everything else.

## [0.20.0] — 2026-09-21 — Notes, themes, keychain

### Added
- **Notes per host** (`⌘⇧N`, third tab in the right slot): free text saved as you type; works for `~/.ssh/config` hosts too (kept in `hosts.json` meta). A note icon marks hosts that have one.
- **Per-host terminal theme** (host editor → Organise): a preset override, e.g. GitHub Light for the one box you keep mistaking for prod.
- **Keychain unlock** (setting, off by default): the vault master password is kept in the OS keychain (`go-keyring`: macOS Keychain, Windows Credential Manager, Secret Service on Linux) and the vault unlocks at launch. Turning it off deletes the entry.

## [0.19.0] — 2026-09-21 — Attention

### Added
- **Tab activity**: a dot on inactive tabs when output arrives, amber on BEL; cleared when you switch to it.
- **Long command toasts**: a command that ran ≥ 10 s in a background tab announces itself (host, duration, exit code, the command); click the toast to jump there.
- **Swarm watch**: with auto-refresh on, the Docker panel diffs each refresh and toasts replica changes, newly failed/rejected tasks, container state changes and node status changes.
- In-app toast stack (bottom-right, max 5, auto-dismiss).

## [0.18.0] — 2026-09-21 — Files, the power bits

### Added
- **Recursive delete** with a real confirm: "3 folders, 41 files, 12 MB — no trash". `⌘⌫` too.
- **Search in folder** (`⌘F` in a pane): names under the current folder, `find -iname` on the host or a walk locally; click a hit to land on it, double-click to edit.
- **Quick look** (Space): first 64 KB of text, images up to 4 MB, "Edit" straight from the preview.
- **Permissions…** (chmod, octal with presets). Disk usage chip per pane (`df -Pk`), amber above 75 %, red above 90 %.

## [0.17.0] — 2026-09-21 — Backup, move, and the config file

### Added
- **Export everything** (Settings, or ⌘K): one JSON with `hosts.json`, `settings.json`, and the encrypted `vault.json` as an opaque blob. **Import** merges hosts, favorites, snippets, groups and cluster maps by name (imported wins), takes settings only when none exist, and the vault only when none exists (it unlocks with its own master password).
- Rolling backups: the last five `hosts.json` versions in `<data dir>/backups/`, at most one per 10 minutes. "Open data folder" button.
- **Edit `~/.ssh/config` and `known_hosts`** in an editor tab from ⌘K; saving the config refreshes the host list. Local paths accept `~`.

## [0.16.0] — 2026-09-21 — Command history & selection actions

### Added
- **Command history across hosts** (`⌘R`): every command run through Spean (host, cwd, exit code, time) is recorded in `<data dir>/history.jsonl`. The palette searches this host or all hosts (Tab toggles), newest first with repeat counts; Enter types and runs, ⇧Enter types only. Nothing typed with a leading space is recorded.
- **Selection actions**: right-click selected terminal text — Copy, Paste selection, Open path in Files (jumps the right pane to that folder on that host), Forward port & open (for `host:port`, `:port`, or a bare port), Open URL, Star as favorite.
- **Copy on select** setting.

## [0.15.0] — 2026-09-21 — Connection engine

### Added
- **Shared logins** (`internal/sshx/pool.go`): one `ssh.Client` per user@addr along a route, refcounted like `ControlMaster`. A second tab through the same bastion — or to the same host — reuses the open login: no re-auth, no prompt, no rate-limit hit. Dead pooled clients are detected with a keepalive and redialled. Closing a tab releases; the last release closes.
- **Auto-reconnect** (setting, on by default): when the transport drops (not on a clean `exit`), retry after 2, 4, 8, 16, 30 s; Enter retries at once; five failures stop. Exit reasons are now `session closed`, `exit N`, or `connection lost: …`.
- **Agent key matching**: when a host has an explicit key (saved host or `IdentityFile`), only the matching agent key is offered first, so agents with many keys no longer trip the server's attempt limit. Falls back to all keys when none match.
- `~/.ssh/config` `Include` is followed recursively (cycle-safe).

## [0.14.0] — 2026-09-21 — Windows & Linux

### Added
- Windows: ssh-agent over the OpenSSH named pipe (`\\.\pipe\openssh-ssh-agent`, or `SSH_AUTH_SOCK` when it names another pipe); Docker bridge on a named pipe with `DOCKER_HOST=npipe:////./pipe/spean-<label>`; `~/.ssh` found via `os.UserHomeDir`. Local terminal hidden there (no ConPTY yet). Shortcut hints print `Ctrl+` instead of `⌘`.
- GitHub Actions: `check` (vet, tests, tsc, vite) and a three-OS build matrix uploading `spean.app`, `spean` (Linux, `webkit2_41`), `spean.exe`.
- `make build-linux` (Docker) and `make cross-check` (Windows/Linux vet+build from the Mac). `make build-all` now does macOS + Windows locally; Linux comes from CI or Docker.

## [0.13.0] — 2026-09-21 — Host editor & route builder

### Changed
- Host editor rebuilt: a route strip at the top (`you → hop → hop → target`) that lights up per hop after **Test connection**; Host and Route side by side; Shell, Forwards & Docker, and Organise fold away until they hold something.
- **Route builder** replaces the comma-separated jump field: each hop is a picker over saved hosts and `~/.ssh/config` aliases (with hostnames), or a custom `user@host:port`; reorder, remove, add. A picked saved host shows its own route when it has one (first hop's route is honoured, like `ssh -J`; later hops warn that theirs is not). Self-reference is refused.
- **Save & connect** button; Save stays.

## [0.12.0] — 2026-09-21 — Layout and UX

### Fixed
- Clicks landing on the terminal after opening the file browser. The terminal only refit on window resize, so its canvas kept the old width and overflowed onto the pane (xterm's screen layer is positioned, so it won hit-testing). Terminals now refit through a `ResizeObserver` on their own box and clip overflow; any layout change (right pane, split divider, sidebar) refits immediately.

### Changed
- **One right slot** for Files and Docker (segmented control; `⌘⇧F` / `⌘⇧D` open or close; Esc closes). Resizable from its left edge (min 320 px, width remembered), slides in with a short spring, none with reduced motion.
- **Files fit the space**: two panes when the slot is ≥ 640 px, otherwise one pane with a swap button (Local ⇄ host); `⌘C` / `⌘V` and "Paste here" still cross sides. Columns collapse by pane width (Mode under 28 rem, Modified under 22 rem), Back/Forward hide under 24 rem. Docker tables scroll horizontally instead of forcing a 40 rem pane.
- **Sidebar** `⌘B` cycles full → icons (48 px rail: initials, colour ring, status dot, star) → hidden; remembered.
- **Frameless window on macOS**: traffic lights inset into our own chrome; the tab bar and sidebar header drag the window. Windows/Linux keep the OS frame.
- **Empty state**: the dotted canvas keeps its dots and mouse trail but no longer gathers into a star; a card with the bridge logo, ស្ពាន, and three actions (Connect ⌘K, Add host, Local terminal) plus the main shortcuts.
- Bottom drawer merges transfers and forwards into one collapsible strip with a summary line. The status row is gone: hop progress shows as a chip in the tab bar while connecting, notices show there for 6 s.
- Design tokens: `--brand` / `--brand-2` / `--brand-grad` (active tab underline, primary actions, transfer bars), radius 8 for controls, `ring-1 ring-white/10` instead of borders on panels, visible keyboard focus ring, `prefers-reduced-motion` respected. Light theme (GitHub Light) now flips the whole UI, dialogs included.

## [0.11.0] — 2026-09-21 — Docker & Swarm

### Added
- **Docker panel** (`⌘⇧D`, right pane next to Files): Services, Tasks, Nodes, Stacks, Containers tables from `docker … --format '{{json .}}'` over the tab's chain, non-PTY. Filter box, manual / 5 s / 30 s refresh. Plain Docker hosts get Containers; Swarm-only tabs show the daemon's own error. Replicas `n/m` amber when short, red at 0; failed/rejected tasks red with the `--no-trunc` error; non-running containers dimmed.
- **Row actions** (right-click), each a real `docker` command shown before it runs: Logs and Shell open new tabs (`docker service logs -f --tail 200`, `docker logs -f --tail 200`, `docker exec -it … sh -c 'command -v bash >/dev/null && exec bash || exec sh'`); Force update, Scale (prompted), Restart, Stop/Start, Drain/Activate, Remove (confirm dialog shows the exact command); Inspect opens a read-only JSON editor tab.
- **Task → node hop**: tasks carry their node; when the node maps to a Spean host (v0.10 cluster groups), "Shell into task" and "Logs on node" open a tab to *that* node through its own chain and target the container by `com.docker.swarm.task.id`. Unknown node → "Add node as host…" prefills the host editor with the hostname, user, group and the current host's jump chain.
- **Published ports → forward**: click `0.0.0.0:8080->80/tcp` in a table: local forward on a free port to the published port, browser opens `http://localhost:<port>`; stop from the forwards drawer.
- Log/shell tabs are titled `<host> › <container>`; log tabs get Pause (stream keeps flowing, rendering stops, resume flushes) and Clear.
- Editor tab supports read-only text content. `⌘E` now splits below; `⌘⇧D` is the Docker panel.

## [0.10.0] — 2026-09-21 — Many hosts at once

### Added
- **Multi-exec**: pick hosts (or a whole group), run one command, outputs stream into a grid or stack with exit codes. Reuses open tabs' chains, dials temporary ones otherwise. From ⌘K, a group's context menu, or a favorite chip's "Run on many hosts…".
- **Split panes**: `⌘D` right, `⌘⇧D` below, draggable dividers; each pane is a normal session; `⌘W` closes the focused pane.
- **Broadcast input**: per-pane checkbox or the radio button; keystrokes go to every selected pane; amber stripe while active.
- **Snippets**: global favorites, shown after host favorites on the chip strip (host favorite with the same name shadows), edited in the favorites dialog.
- **Verb palette**: ⌘K now has sections Recent, Actions, Favorites, Hosts. Verbs: Forward port, Open files, Log to file, Split pane, Run favorite/snippet, Run command on many hosts, Keys, Lock/Unlock vault, Open local terminal, Broadcast.
- **Session restore**: tabs (host, cwd, local) saved as they change; on launch, asked once with "Remember my answer" (`restore` setting).
- **Session logging**: per pane "Log to file" writes ANSI-stripped, per-line timestamped output to `<data dir>/logs/<host>-<time>.log`.
- **Cluster groups**: a group's context menu marks it as a Swarm cluster; `docker node ls` (over any member) lists nodes with role/status/availability; nodes map to Spean hosts by label, HostName, or a manual pick. Multi-exec offers "run on a manager"; node rows offer Shell and Drain/Activate (typed into a manager tab).
- Backend: `Exec`, `MultiExec` (streaming events), `Snippets/SetSnippets`, `SaveSession/LastSession`, `LogStart/LogStop`, `Groups/SetGroup`, `ClusterDetect`, `ClusterManager`.

## [0.9.0] — 2026-09-21 — Forwarding, local terminal, errors that explain themselves

### Added
- **Port forwarding**: local (`-L`), remote (`-R`), dynamic SOCKS5 (`-D`, built in, CONNECT only) over any tab's chain. Saved per host with start-on-connect; "Forward port on …" from ⌘K. Forwards drawer with bytes, stop, and Open in browser for local forwards. Forwards stop with their tab.
- **Docker socket over SSH**: per-host toggle bridges the remote Docker socket (path editable for rootless/Podman) to `<data dir>/sock/<label>.sock` through the full hop chain. Host row shows a Docker badge with **Copy `DOCKER_HOST`** and **Create docker context** (`docker context create spean-<label>`). Local `docker`, `docker compose`, lazydocker and IDE plugins then talk to the remote daemon.
- **Local terminal tab** (`$SHELL -l` in a PTY via `creack/pty`), same component and directory hook. "Local" button in the sidebar; ⌘K → "Open local terminal".
- **Error explanation**: DNS, refused, timeout, no route, host-key change (with the `known_hosts` line to remove), auth refusal (methods tried) become a sentence with a next step, shown in a card with Retry and Edit host.
- **Test connection** in the host editor: dials the chain without a shell and reports per hop.
- Backend: `internal/forward`, `ForwardStart/Stop`, `Forwards`, `DockerStart`, `DockerHost`, `DockerContextCreate`, `ConnectLocal`, `TestConnection`, `sshx.Explain`.

## [0.8.0] — 2026-09-21 — Vault, keys, server list

### Added
- **Vault** (`vault.json` in the data dir): per-host passwords and key passphrases plus imported/generated private keys, encrypted with XChaCha20-Poly1305 under an argon2id key from a master password. Salt and parameters travel with the file, so it can be copied to another machine. Unlock at launch (skippable), `⌘L` locks and keeps sessions. Password and passphrase prompts offer **Remember in vault**; the first time creates the vault. Auth checks the vault before prompting. Nothing decrypted is written to disk.
- **Key manager**: keys from `~/.ssh` (public part, fingerprint) and the vault; generate ed25519 with optional passphrase to `~/.ssh/<name>` or into the vault; copy public key; **Install on host** appends to `authorized_keys` over SFTP (`ssh-copy-id` without a shell). Host editor picks a key from the list (`vault:<name>` refs work as identity files).
- **Server list**: collapsible groups (state persisted), starred hosts first, drag to reorder saved hosts within a group, colour label, tag chips, last-connected age, status dot from tab state, list/card view. Search matches label, hostname, user, group, tags. Right-click: Connect, Star, Edit, Duplicate, Delete, Import (for config aliases), Copy ssh command, Copy public key to host.
- **Onboarding** on first run: import from `~/.ssh/config`, a jump-chain diagram, shortcuts. Host editor now hides Connection/Colour behind **More…**.
- Backend: `VaultStatus/Create/Unlock/Lock/Remember/Forget/Hosts`, `ListKeys`, `GenerateKey`, `InstallKey`, `ImportHost`, `Star`, `Reorder`; last-connected timestamps recorded per host.

### Changed
- Storage stays `hosts.json` + `settings.json` + encrypted `vault.json` rather than a bbolt database: same durability rules (versioned, migrated, under the OS config dir), no CGO, no new dependency.

## [0.7.0] — 2026-09-21 — Favorites, editor, terminal, settings

### Added
- **Favorite commands per host.** Chip strip under the tab bar; click types the command (`run` also presses Enter), `⌘1`–`⌘9` fire the first nine, only when the shell is at a prompt (chip shakes otherwise). Stored on the saved host, or in `hosts.json` `meta` for `~/.ssh/config` aliases (that file is never written).
- Capture: ★ / `⌘⇧S` stars the last command (login hook now emits OSC 133;D exit markers and a private OSC 7770 with the last command); import from remote `.zsh_history` / `.bash_history` / fish history ranked by frequency; edit in a list dialog.
- `{{name}}` placeholders prompt before typing, values remembered per host for the session. `{{dropped}}` chips accept a file dropped from Finder or a pane: uploaded to `/tmp/spean-*`, path substituted, temp removed after the command ends.
- Favorite packs (Docker, Swarm, Git, systemd) toggled per host; entries stay editable. `git`-tagged hosts default agent forwarding on, with a one-line explanation of what forwarding exposes.
- ⌘K lists the active host's favorites as "Run *name* on *host*".
- **Editor.** CodeMirror 6 tab for local or remote files (double-click in a pane, or Edit in the context menu). Syntax packs load lazily. `⌘S` saves atomically (temp + rename), preserves line endings, refuses binary and > 5 MB. Dirty marker on the tab, confirm before closing dirty. Permission denied offers **Save with sudo**: file goes to `/tmp` over SFTP, `sudo mv` is typed into the tab's shell.
- **Terminal.** `⌘F` search bar, clickable links, Unicode 11 widths, OSC 52 clipboard. Multi-line paste asks first. Visual bell.
- **Settings** (`⌘,`, `settings.json` versioned): font, size, theme presets (Spean Dark, Solarized Dark, GitHub Light), scrollback, cursor, bell, track-directory default for config hosts, keepalive interval, confirm on close, transfer concurrency. Changes preview live; Cancel reverts.
- Backend: `ReadFile`, `WriteFile`, `ReadHistory`, `Favorites`, `SetFavorites`, `Settings`, `SaveSettings`.

## [0.6.0] — 2026-09-21 — Transfers

### Added
- Dual-pane file browser (`⌘⇧F`). Each pane picks a source: Local or any connected tab. Drag rows between panes to copy, `⌘`-drag to move; drop on a folder row or the pane background. `⌘C` / `⌘V` across panes, `⌘A`, `⌘⌫` delete, multi-select with `⌘`/`⇧` click. Finder drops route to the pane and folder under the cursor.
- Transfer engine (`internal/transfer`): one job per drop, 2 concurrent, streamed through this machine so remote → remote works across unrelated chains. Directories recurse; mode bits and mtime preserved; symlinks copied as content; special files skipped; per-file errors do not abort the job.
- Conflict policy asked once per job (Overwrite / Overwrite if newer / Keep both / Skip).
- Transfers drawer at the bottom: progress bar, bytes, speed, ETA, cancel, retry failed files.
- Download now asks for a folder and runs as a job (multi-select works). Upload picker likewise.

### Changed
- Backend file methods are source-generic: `List`, `Mkdir`, `Rename`, `Delete`, `Download`, `UploadPick`, `Transfer`, `TransferCancel`, `TransferRetry`, `Transfers` replace the `Sftp*` set. `src` is `"local"` or a tab id.
- File panel is no longer per tab; the browser is global and the right pane defaults to the active tab.

## [0.5.0] — 2026-09-21 — Click to cd

### Added
- Panel and shell share one working directory. Click a folder (or a breadcrumb segment) and the shell `cd`s there; `cd` in the shell and the panel follows. Shell position comes from OSC 7, installed by a bash/zsh prompt hook typed at login. "Follow shell" toggle in the panel header; per-host "Track directory" toggle (on by default) for fish, `sh`, or restricted shells.
- Commands are only typed into the shell when it is at a prompt (last OSC 7 seen, nothing typed since); otherwise the panel moves alone and says so.
- File panel: breadcrumb path bar (double-click to type), back/forward, sortable Name / Size / Modified / Mode columns, hidden-files toggle, inline rename and new-folder name, right-click menu (Open, Download, Rename, Delete, Copy path, Paste path into shell, New folder, Upload).
- `SftpRename` backend method.
- `hosts.json` now carries `{"version": 1, "hosts": [...]}`. The old bare array is migrated on first read (a `.bak` is kept); a file from a newer Spean is read but refuses writes.

### Added (earlier, unreleased)
- `⌘K` / `Ctrl+K` Spotlight-style host palette with keyboard navigation; Enter on no match connects to a literal `user@host`.
- Animated tab bar (sliding underline, hover highlight), connection loader overlay, and an empty-state canvas. Pieces adapted from [obsidianui.dev](https://www.obsidianui.dev) (MIT).
- `plan.md` handoff document with the v0.5–v1.0 roadmap and data-durability rules.
- This changelog.
- `Makefile` with `setup`, `dev`, `build`, `build-all`, `check`, `test`, `gen`, `icon`, `clean`, `release` targets.

### Changed
- Frontend build now includes `motion`; bundle grew to ~825 KB (245 KB gzip).

## [0.4.0] — 2026-09-20 — File transfer

### Added
- SFTP panel per tab over the existing chained client (`pkg/sftp`): browse, path bar, up, refresh.
- Download via native save dialog (double-click or button).
- Upload via file picker, or drag files from Finder onto the panel (Wails `OnFileDrop`).
- New folder and delete (non-recursive).

## [0.3.0] — 2026-09-20 — Usable daily

### Added
- Multiple tabs; each tab owns its own hop chain, PTY, and SFTP client. Events are namespaced per tab.
- Keepalive every 30 s (`keepalive@openssh.com`). On drop the tab shows a notice; Enter reconnects through the same chain into the same tab.
- Search box filters hosts by alias, group, or tag; Enter connects to the single match or a literal `user@host`.
- Agent forwarding per saved host, and honouring `ForwardAgent yes` from `~/.ssh/config`.
- Startup snippet typed into the shell after login.
- `keyboard-interactive` auth and three retries for password auth.

### Changed
- Frontend rewritten from vanilla TypeScript to React 19 + Vite + Tailwind v4 + shadcn/ui.
- Host-key, passphrase, and password prompts moved to an in-page dialog. WKWebView does not implement `window.prompt`/`confirm`; the native calls silently returned empty values and broke password auth.

### Fixed
- Password auth sending an empty string because `window.prompt` returned `null` inside Wails.
- A stale session's exit event could tear down a newer reconnect in the same tab; guarded with a per-connect generation check.

## [0.2.0] — 2026-09-18 — Hops

### Added
- `DialChain` with arbitrary depth: each hop is a `direct-tcpip` channel through the previous client. Every intermediate client is kept and closed in reverse order.
- Recursive `ProxyJump` resolution from `~/.ssh/config` with OpenSSH `-J` semantics (first jump recursed, later jumps direct). Loop guard at depth 32.
- Per-hop progress and per-hop error reporting (`hop N (addr): …`).
- Host editor dialog (`+` in the sidebar): label, address, port, username, key file, jump chain, group, tags, agent forwarding, startup snippet. Stored in `hosts.json` under the OS config dir; `~/.ssh/config` is never modified. Saved hosts and config hosts are merged in one list, grouped.
- App icon and logo (`build/logo.svg`, `build/appicon.png`).

## [0.1.0] — 2026-09-18 — Connect

### Added
- Wails v2 scaffold with an embedded xterm.js terminal; resize propagates to the remote PTY.
- `~/.ssh/config` parsing (`HostName`, `User`, `Port`, `IdentityFile`, `ProxyJump`) including one level of `Include`.
- `known_hosts` verification via `skeema/knownhosts` with a first-connect fingerprint prompt; changed keys fail hard.
- Authentication: `ssh-agent` first, then identity files (encrypted keys prompt for a passphrase, held in memory only), then password. No credential storage.
- Literal `user@host:port` targets for hosts not in any config.
- `go test` coverage for chain resolution and saved-host lookup.

[Unreleased]: https://github.com/OWNER/spean/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/OWNER/spean/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/OWNER/spean/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/OWNER/spean/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/OWNER/spean/releases/tag/v0.1.0
