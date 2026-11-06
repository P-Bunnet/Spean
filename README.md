<div align="center">

<img src="build/logo.svg" width="140" alt="Spean logo">

# Spean

**ស្ពាន** · Khmer for *bridge*

A free, local-first SSH client with unlimited jump-host chaining.<br>
Built because every client that does multi-hop well puts it behind a subscription.

[![Go](https://img.shields.io/badge/Go-1.25+-00ADD8?logo=go&logoColor=white)](https://go.dev)
[![Wails](https://img.shields.io/badge/Wails-v2-DF0000?logo=wails&logoColor=white)](https://wails.io)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey)](#install)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![Release](https://img.shields.io/github/v/release/P-Bunnet/Spean?include_prereleases)](https://github.com/P-Bunnet/Spean/releases)
[![build](https://github.com/P-Bunnet/Spean/actions/workflows/build.yml/badge.svg)](https://github.com/P-Bunnet/Spean/actions/workflows/build.yml)

[Features](#features) · [Install](#install) · [Quick start](#quick-start) · [Usage](#usage) · [Security](#security) · [Architecture](#architecture) · [Roadmap](#roadmap) · [Changelog](CHANGELOG.md)

</div>

---

## Why

Multi-hop SSH is a solved problem on the command line: `ssh -J a,b,c target`. Desktop clients treat it as a premium feature. Spean reads the `~/.ssh/config` you already maintain, resolves `ProxyJump` chains of any depth, and gives you tabs, a file panel, and a host list. No account, no sync, no telemetry.

The design goal is simple: one screen, keyboard first, defaults that are already right. Connect through two bastions in under a minute without reading a manual.

## Features

| | |
|---|---|
| 🔗 **Unlimited hops** | `ProxyJump` chains resolved recursively with OpenSSH `-J` semantics. Per-hop progress (`bastion ✓ → dmz ✓ → target …`) and errors that name the hop that failed. |
| 📄 **Your config, untouched** | Reads `~/.ssh/config` including `Include`. Spean never writes to it. Hosts you add in the UI live in a separate `hosts.json`. |
| 🗂 **Tabs** | Every tab is its own chain and its own PTY. Resize propagates to the remote, so `vim` and `htop` render correctly. |
| 🔁 **Keepalive + reconnect** | 30 s keepalive. When a session drops, press Enter to reconnect through the same chain. |
| ⌘K **Spotlight** | Palette that searches alias, group, and tag. Enter with no match connects to a literal `user@host`. |
| 📁 **Dual-pane files** | Local and remote (or remote and remote) side by side. Drag between panes, `⌘`-drag to move, drop from Finder. Directories, progress, cancel, retry. |
| ★ **Favorite commands** | Per-host chips, `⌘1`–`⌘9`, star the last command, import from remote history, Docker/Swarm/Git/systemd packs, `{{placeholders}}`, drop a file onto a chip to run with it. |
| ✎ **Editor** | CodeMirror tab for local and remote files, atomic save, `sudo` save for root-owned files. |
| 🔐 **Vault** | Optional. Passwords, passphrases and keys encrypted with argon2id + XChaCha20-Poly1305 under a master password. `⌘L` locks. |
| 🔑 **Keys** | Generate ed25519, copy public key, install on a host in one click. |
| ⇄ **Port forwarding** | `-L`, `-R`, SOCKS `-D` through any chain, saved per host, drawer with stop and open-in-browser. |
| 🐳 **Docker over SSH** | Remote Docker socket bridged to a local unix socket through all hops; `DOCKER_HOST` or a docker context. |
| ⌨ **Local terminal** | One tab for the local shell. |
| ⚡ **Many hosts** | Multi-exec with streamed output, broadcast input, split panes, Swarm cluster groups with node mapping. |
| ⌘K **Verb palette** | Every action from one box: connect, forward, run favorite, files, log, lock. Session restore and logging. |
| ⌘R **History** | Every command you ran, on every host, searchable; right-click a selection to open it in Files, forward its port, or star it. |
| 📓 **Runbooks & notes** | Step-by-step command sequences with checkpoints; free-text notes per host; Ports pane with one-click forwards. |
| 🔁 **Resilient** | Shared logins per bastion, auto-reconnect with backoff, export/import of everything. |
| 🐋 **Docker & Swarm panel** | Services, tasks, nodes, stacks, containers as tables; logs, shell, scale, drain from a right-click; shell into a task on the node that runs it; click a published port to forward and open it. |
| ⚙ **Settings** | Font, theme presets, cursor, scrollback, keepalive, live preview. |
| 🔗 **Shared directory** | Click a folder and the shell `cd`s there; `cd` in the shell and the panel follows (OSC 7 prompt hook, bash/zsh). |
| 🔐 **Host keys verified** | `known_hosts` checked on every hop. First connect shows the fingerprint. Changed keys fail hard. No bypass flag exists. |
| 🔑 **Agent first** | `ssh-agent`, then identity files, then password / keyboard-interactive. Agent forwarding per host. |
| ✍️ **Host editor** | Label, address, port, user, key, jump chain, group, tags, agent forwarding, startup snippet. |

## Install

Binaries for every release are on the [Releases](https://github.com/P-Bunnet/Spean/releases) page (`SHA256SUMS` alongside).

| | |
|---|---|
| **macOS** | `brew install --cask P-Bunnet/tap/spean` — or download the zip. Builds are ad-hoc signed, not notarised (no paid Apple developer account): on first launch **right-click → Open**, or `xattr -dr com.apple.quarantine Spean.app`. Homebrew skips that prompt. |
| **Linux** | `spean-vX.Y.Z-linux-amd64.tar.gz` → `./spean`. Needs GTK 3 and WebKitGTK 4.1 (`libwebkit2gtk-4.1-0` on Debian/Ubuntu). |
| **Windows** | `winget install P-Bunnet.Spean` once the manifest is merged, or the zip. Unsigned: SmartScreen → **More info → Run anyway**. Local terminal tab is not available on Windows yet. |

Spean makes no network connections of its own except the SSH sessions you start and, if you turn it on in Settings, one request to GitHub for the latest release tag.

## Quick start

```bash
# Go 1.25+, Node 22+, Xcode Command Line Tools on macOS (GTK/WebKitGTK dev packages on Linux)
git clone https://github.com/P-Bunnet/Spean.git && cd Spean
make setup      # Wails CLI, Go modules, npm deps
make dev        # development window with live reload
make build      # build/bin/spean.app, ad-hoc signed
make cross-check   # vet + build for Windows/Linux without CGO
```

## Usage

| Action | How |
|---|---|
| Connect | Click a host in the sidebar, or `⌘K` and type |
| Connect to an ad-hoc host | Type `user@host:port` in the search box or the palette, press Enter |
| New tab for the same host | Click it again |
| Close tab | `×` on the tab, or middle-click |
| Reconnect after drop | Press Enter in the dead tab |
| Files | Folder icon in the tab bar. Double-click a folder to enter, double-click a file to download, drop files from Finder to upload |
| Add / edit a host | `+` in the sidebar, or the pencil on a saved host |
| Jump chain for a saved host | Comma-separated in the *Jump hosts* field: `bastion, ops@10.0.0.9:2222`. Each entry may be a config alias, a saved label, or a literal |

### Where things live

| Path | Purpose |
|---|---|
| `~/.ssh/config` | Read-only source of hosts. `Include` supported one level deep |
| `~/.ssh/known_hosts` | Host keys. New entries appended on accept |
| `~/Library/Application Support/spean/` | Everything Spean owns: `hosts.json` today, vault and settings later (Linux: `$XDG_CONFIG_HOME/spean/`). Survives app updates and reinstalls; delete it to reset |

## Security

These rules are not optional and do not change between versions.

- **Host keys are always verified.** Unknown hosts prompt with the SHA256 fingerprint and are written to `known_hosts` on accept. A mismatch is a hard failure. `ssh.InsecureIgnoreHostKey` does not appear in the codebase.
- **Agent first.** If your key is in `ssh-agent`, Spean never touches the key file.
- **Decrypted keys live in memory only**, for the lifetime of the session.
- **Nothing is stored unless you ask.** Passwords and passphrases are asked at connect time. Tick *Remember in vault* and they go into `vault.json`, encrypted with XChaCha20-Poly1305 under an argon2id key from your master password. The key lives in memory only; `⌘L` drops it.
- **No network calls** other than the SSH connections you start.

## Architecture

```
┌────────────────────────────────────────────────────────┐
│  Frontend · React + Tailwind + shadcn/ui               │
│  sidebar · tabs · xterm.js per tab · SFTP panel · ⌘K   │
└───────────────────────┬────────────────────────────────┘
                        │ Wails bindings + events (per tab id)
┌───────────────────────┴────────────────────────────────┐
│  Go backend                                            │
│  app.go            bound methods, tab registry, prompts│
│  internal/config   ~/.ssh/config + hosts.json → chain  │
│  internal/sshx     DialChain, auth, known_hosts        │
│  internal/session  PTY shell, resize, agent fwd        │
│  pkg/sftp          file panel over the chained client  │
└────────────────────────────────────────────────────────┘
```

The hop chain is small: dial hop 1, then for every further hop open a `direct-tcpip` channel through the previous client and hand it to `ssh.NewClientConn`. Every intermediate client is kept so the chain closes in order.

| Layer | Choice |
|---|---|
| Shell | [Wails v2](https://wails.io) |
| SSH | `golang.org/x/crypto/ssh`, `skeema/knownhosts`, `kevinburke/ssh_config`, `pkg/sftp` |
| UI | React 19, Vite, Tailwind v4, [shadcn/ui](https://ui.shadcn.com), [xterm.js](https://xtermjs.org) |
| Motion | Four pieces from [obsidianui.dev](https://www.obsidianui.dev) (tabs, palette, loader, empty state) |

## Development

```bash
make            # list targets
make check      # go vet + tsc
make test       # go test ./...
make gen        # regenerate frontend/wailsjs after changing bound methods
make build-all  # macOS universal + Linux + Windows into dist/
make release VERSION=v0.5.0   # checks, tag, build-all (never pushes)
```

Things that bite:

- WKWebView has no `alert` / `confirm` / `prompt`. They return `null` silently. Every user question goes through `PromptDialog`.
- `wails dev` runs a bare binary, so no Dock icon in dev. Only `wails build` output carries the icon.
- Bound methods may return `(T, error)` only.

See [plan.md](plan.md) for the full handoff: repo map, API, mechanics, known gaps.

## Roadmap

| Version | Theme | Status |
|---|---|---|
| v0.1 | Connect, config, host keys, agent | ✅ |
| v0.2 | Hops, per-hop progress, host editor | ✅ |
| v0.3 | Tabs, keepalive, search, agent forwarding | ✅ |
| v0.4 | SFTP panel, drag-and-drop | ✅ |
| v0.5 | Click a folder, shell `cd`s there; panel follows the shell (OSC 7); breadcrumbs, rename | ✅ |
| v0.6 | Dual-pane file manager: drag between local ↔ server ↔ server through any hops, transfer queue with progress | ✅ |
| v0.7 | Favorite commands per host (star last command, import from remote history, `⌘1`–`⌘9`), Docker/Swarm/Git packs, drop-to-run, editor with `sudo` save, terminal search/links/clipboard, settings | ✅ |
| v0.8 | Encrypted vault (bbolt + argon2id + XChaCha20), key manager with one-click `ssh-copy-id`, richer server list, onboarding | ✅ |
| v0.9 | Port forwarding (L/R/D), Docker socket over SSH (`DOCKER_HOST` through any hops), local terminal tab, human-readable connection errors, "Test connection" | ✅ |
| v0.10 | Multi-exec, cluster groups, broadcast input, split panes, snippets, action palette, session restore, logging | ✅ |
| v0.11 | Docker & Swarm panel, container shell / log tabs, task → node hop, published port → forward | ✅ |
| v0.12 | Layout & UX: resizable right slot, responsive files, sidebar rail, frameless macOS window, empty state, tokens | ✅ |
| v0.13 | Host editor rebuilt: visual route strip, hop picker over saved hosts / config aliases, Save & connect | ✅ |
| v0.14 | Windows runtime (agent pipe, Docker npipe, `Ctrl` hints), CI builds for macOS / Linux / Windows | ✅ |
| v0.15 | Shared logins per bastion (ControlMaster-style), auto-reconnect with backoff, agent key matching, recursive `Include` | ✅ |
| v0.16 | Command history across hosts (`⌘R`), terminal selection actions, copy on select | ✅ |
| v0.17 | Export / import everything, rolling backups, edit `~/.ssh/config` in-app | ✅ |
| v0.18 | Files: recursive delete with counts, search in folder, quick look, chmod, disk usage | ✅ |
| v0.19 | Tab activity dots, long-command toasts, Swarm watch | ✅ |
| v0.20 | Host notes, per-host theme, keychain-backed vault unlock | ✅ |
| v0.21 | Runbooks: step-by-step command sequences with checkpoints | ✅ |
| v0.22 | Ports pane: what is listening, one-click forward | ✅ |
| v0.23 | Public repo: AGPL-3.0, release CI for three platforms, Homebrew/winget packaging, opt-in update check | ✅ |
| v1.0 | Verified on real hosts across all three platforms, notarised macOS build, signed Windows build | planned |

Details in [plan.md](plan.md). History in [CHANGELOG.md](CHANGELOG.md).

## Status

Early, moving fast. Everything through v0.23 is built and type-checked; end-to-end behaviour against real bastions, Swarm clusters and Windows agents needs more eyes than one — issues with your setup details are the most useful thing you can send. Read the changelog before upgrading.

## Contributing

Issues and PRs welcome. Read `plan.md` first: it holds the design rules (host keys are always verified, secrets never touch disk unencrypted, every user prompt goes through `PromptDialog`) and the reasoning behind the stack. `make check test` must pass; `make cross-check` keeps Windows/Linux compiling.

## Credits

- [Wails](https://wails.io), [xterm.js](https://xtermjs.org), [shadcn/ui](https://ui.shadcn.com)
- [ObsidianUI](https://www.obsidianui.dev) — Magnet Tabs, Apple Spotlight, Jelly Loader, Dotted Grid (MIT)
- `golang.org/x/crypto`, `skeema/knownhosts`, `kevinburke/ssh_config`, `pkg/sftp`

## License

[AGPL-3.0](LICENSE). Use it, fork it, ship it — but a modified Spean you distribute or run as a service must stay open under the same terms. Third-party components keep their own licences (MIT for the ObsidianUI pieces and shadcn/ui; see `go.mod` and `frontend/package.json`).
