package main

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	goruntime "runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/pkg/sftp"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/crypto/ssh"

	"spean/internal/config"
	"spean/internal/forward"
	"spean/internal/session"
	"spean/internal/sshx"
	"spean/internal/transfer"
	"spean/internal/vault"
)

// shell is what a tab types into: a remote PTY session or a local one.
type shell interface {
	Write([]byte)
	Resize(cols, rows int)
	Close()
}

// tab is one terminal tab: its own chain, shell, and lazily-opened sftp client.
// chain is nil for a local terminal.
type tab struct {
	alias string
	chain *sshx.Chain
	sess  shell
	sftp  *sftp.Client
	stop  chan struct{} // closes keepalive loop
	log   *logWriter    // session log, nil when off
}

type App struct {
	ctx   context.Context
	xfer  *transfer.Engine
	vault *vault.Vault
	fwd   *forward.Manager

	mu      sync.Mutex
	tabs    map[string]*tab
	prompts map[string]chan string
	steps   map[string]*stepShell // open step shells by run id
	nextID  int
}

func NewApp() *App {
	a := &App{tabs: map[string]*tab{}, prompts: map[string]chan string{}, steps: map[string]*stepShell{}}
	a.xfer = transfer.New(config.LoadSettings().Concurrency) // ponytail: read once; change applies at next launch
	a.xfer.Resolve = a.fs
	a.xfer.Emit = func(j *transfer.Job) { runtime.EventsEmit(a.ctx, "transfer:update", j) }
	a.xfer.Ask = func(msg string) string { v, _ := a.Ask("conflict", "", msg, false); return v }
	a.vault = vault.New(vault.DefaultPath())
	a.fwd = forward.New()
	a.fwd.Emit = func(f *forward.Forward) { runtime.EventsEmit(a.ctx, "forward:update", f) }
	return a
}

func (a *App) startup(ctx context.Context) { a.ctx = ctx }

func (a *App) shutdown(ctx context.Context) {
	a.mu.Lock()
	ids := make([]string, 0, len(a.tabs))
	for id := range a.tabs {
		ids = append(ids, id)
	}
	a.mu.Unlock()
	for _, id := range ids {
		a.Disconnect(id)
	}
}

// Platform tells the frontend which chrome to draw (traffic-light inset on darwin).
func (a *App) Platform() string { return goruntime.GOOS }

// Hosts lists saved hosts merged with ~/.ssh/config aliases.
func (a *App) Hosts() []config.Entry { return config.Hosts() }

// SavedHost returns a saved host for editing, or nil for a config-only alias.
func (a *App) SavedHost(label string) *config.SavedHost { return config.Lookup(label) }

func (a *App) SaveHost(h config.SavedHost) error { return config.SaveHost(h) }

func (a *App) DeleteHost(label string) error { return config.DeleteHost(label) }

func (a *App) Star(alias string, on bool) error { return config.Star(alias, on) }

func (a *App) Reorder(labels []string) error { return config.Reorder(labels) }

func (a *App) Runbooks() []config.Runbook { return config.Runbooks() }

func (a *App) SetRunbooks(r []config.Runbook) error { return config.SetRunbooks(r) }

func (a *App) Notes(alias string) string { return config.Notes(alias) }

func (a *App) SetNotes(alias, text string) error { return config.SetNotes(alias, text) }

func (a *App) Favorites(alias string) []config.Favorite { return config.Favorites(alias) }

func (a *App) SetFavorites(alias string, favs []config.Favorite) error {
	return config.SetFavorites(alias, favs)
}

func (a *App) Settings() config.Settings { return config.LoadSettings() }

func (a *App) SaveSettings(s config.Settings) error { return config.SaveSettings(s) }

// Progress is one per-hop connection update.
type Progress struct {
	Alias  string `json:"alias"`
	Status string `json:"status"`
	Err    string `json:"err,omitempty"`
}

// Connect opens a shell for tab id to alias (config Host, saved label, or user@host:port).
// Events are namespaced by tab: connect:progress:<id>, term:data:<id>, term:exit:<id>.
func (a *App) Connect(id, alias string, cols, rows int) error {
	a.Disconnect(id) // reconnect into the same tab replaces the old session
	hops, target, err := config.Resolve(alias)
	if err != nil {
		return err
	}
	var failedAddr string
	chain, err := sshx.DialChain(hops, target, a, func(alias, status string, err error) {
		p := Progress{Alias: alias, Status: status}
		if err != nil {
			p.Err = err.Error()
			for _, h := range append(hops, target) {
				if h.Alias == alias {
					failedAddr = h.Addr
				}
			}
		}
		runtime.EventsEmit(a.ctx, "connect:progress:"+id, p)
	})
	if err != nil {
		return errors.New(sshx.Explain(errors.Unwrap(err), failedAddr)) // hop N (addr): prefix stripped, sentence kept
	}
	t := &tab{alias: alias, chain: chain, stop: make(chan struct{})}
	sess, err := session.Start(chain.Client(), cols, rows,
		session.Options{ForwardAgent: target.ForwardAgent, Snippet: target.Snippet},
		func(b []byte) { a.emitData(id, t, b) }, // []byte → base64 in JSON, binary-safe
		func(err error) {
			runtime.EventsEmit(a.ctx, "term:exit:"+id, exitMessage(err))
			a.closeTab(id, t) // only tears down if t is still the tab's current session
		})
	if err != nil {
		chain.Close()
		return err
	}
	t.sess = sess
	a.mu.Lock()
	a.tabs[id] = t
	a.mu.Unlock()
	config.Touch(alias)
	go a.keepalive(t)
	if h := config.Lookup(alias); h != nil {
		for _, f := range h.Forwards {
			if f.Auto {
				a.fwd.Start(id, f.Kind, f.Listen, f.Target, chain.Client())
			}
		}
		if h.DockerSock != "" {
			a.fwd.Start(id, "docker", dockerSockPath(alias), h.DockerSock, chain.Client())
		}
	}
	return nil
}

// ConnectLocal opens a tab running the local $SHELL. Same events as Connect.
func (a *App) ConnectLocal(id string, cols, rows int) error {
	a.Disconnect(id)
	t := &tab{alias: "local", stop: make(chan struct{})}
	sess, err := session.StartLocal(cols, rows,
		func(b []byte) { a.emitData(id, t, b) },
		func(err error) {
			runtime.EventsEmit(a.ctx, "term:exit:"+id, "shell exited")
			a.closeTab(id, t)
		})
	if err != nil {
		return err
	}
	t.sess = sess
	a.mu.Lock()
	a.tabs[id] = t
	a.mu.Unlock()
	return nil
}

// TestConnection dials the chain and closes it: per-hop results without a shell.
func (a *App) TestConnection(alias string) ([]Progress, error) {
	hops, target, err := config.Resolve(alias)
	if err != nil {
		return nil, err
	}
	var out []Progress
	chain, err := sshx.DialChain(hops, target, a, func(alias, status string, err error) {
		p := Progress{Alias: alias, Status: status}
		if err != nil {
			addr := ""
			for _, h := range append(hops, target) {
				if h.Alias == alias {
					addr = h.Addr
				}
			}
			p.Err = sshx.Explain(errors.Unwrap(err), addr)
		}
		if status == "connecting" {
			return
		}
		out = append(out, p)
	})
	if chain != nil {
		chain.Close()
	}
	return out, nil
}

func (a *App) emitData(id string, t *tab, b []byte) {
	runtime.EventsEmit(a.ctx, "term:data:"+id, b)
	a.mu.Lock()
	l := t.log
	a.mu.Unlock()
	if l != nil {
		l.Write(b)
	}
}

// exitMessage: "session closed" / "exit N" for a shell that ended on its own,
// "connection lost: …" when the transport died (the UI auto-reconnects only on the latter).
func exitMessage(err error) string {
	if err == nil {
		return "session closed"
	}
	var ee *ssh.ExitError
	if errors.As(err, &ee) {
		return fmt.Sprintf("exit %d", ee.ExitStatus())
	}
	return "connection lost: " + err.Error()
}

// keepalive pings the target every 30s; a failed ping closes the shell, which
// surfaces as term:exit so the UI can offer reconnect.
func (a *App) keepalive(t *tab) {
	tick := time.NewTicker(time.Duration(config.LoadSettings().KeepaliveSec) * time.Second)
	defer tick.Stop()
	for {
		select {
		case <-t.stop:
			return
		case <-tick.C:
			if _, _, err := t.chain.Client().SendRequest("keepalive@openssh.com", true, nil); err != nil {
				t.sess.Close()
				return
			}
		}
	}
}

func (a *App) get(id string) *tab {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.tabs[id]
}

func (a *App) Write(id, data string) {
	if t := a.get(id); t != nil {
		t.sess.Write([]byte(data))
	}
}

func (a *App) Resize(id string, cols, rows int) {
	if t := a.get(id); t != nil {
		t.sess.Resize(cols, rows)
	}
}

func (a *App) Disconnect(id string) { a.closeTab(id, nil) }

// closeTab tears down tab id. If only is non-nil, it only acts when that is still the live tab.
func (a *App) closeTab(id string, only *tab) {
	a.mu.Lock()
	t := a.tabs[id]
	if t == nil || (only != nil && t != only) {
		a.mu.Unlock()
		return
	}
	delete(a.tabs, id)
	a.mu.Unlock()
	close(t.stop)
	a.fwd.StopTab(id)
	if t.log != nil {
		t.log.f.Close()
	}
	if t.sftp != nil {
		t.sftp.Close()
	}
	t.sess.Close()
	if t.chain != nil {
		t.chain.Close()
	}
}

// ---- prompts ---------------------------------------------------------------

// Ask implements sshx.Prompter: emit a prompt event, block until Answer arrives.
func (a *App) Ask(kind, alias, msg string, secret bool) (string, error) {
	ch := make(chan string, 1)
	a.mu.Lock()
	a.nextID++
	id := fmt.Sprint(a.nextID)
	a.prompts[id] = ch
	a.mu.Unlock()
	defer func() { a.mu.Lock(); delete(a.prompts, id); a.mu.Unlock() }()

	runtime.EventsEmit(a.ctx, "prompt", map[string]any{"id": id, "kind": kind, "alias": alias, "msg": msg, "secret": secret})
	select {
	case v := <-ch:
		return v, nil
	case <-time.After(60 * time.Second):
		return "", errors.New("prompt timed out")
	}
}

// Answer resolves a pending prompt.
func (a *App) Answer(id, value string) {
	a.mu.Lock()
	ch := a.prompts[id]
	a.mu.Unlock()
	if ch != nil {
		ch <- value
	}
}

// ---- files -----------------------------------------------------------------
// src is "local" or a tab id; the same methods serve both panes.

type FileEntry struct {
	Name  string `json:"name"`
	Size  int64  `json:"size"`
	Mode  string `json:"mode"`
	IsDir bool   `json:"isDir"`
	MTime int64  `json:"mtime"`
}

type Listing struct {
	Path    string      `json:"path"` // resolved absolute path
	Entries []FileEntry `json:"entries"`
}

func (a *App) sftpClient(id string) (*sftp.Client, error) {
	t := a.get(id)
	if t == nil || t.chain == nil {
		return nil, errors.New("tab not connected")
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if t.sftp == nil {
		c, err := sftp.NewClient(t.chain.Client())
		if err != nil {
			return nil, fmt.Errorf("sftp: %w", err)
		}
		t.sftp = c
	}
	return t.sftp, nil
}

// expandHome turns ~ and ~/x into absolute local paths (the editor opens ~/.ssh/config).
func expandHome(src, p string) string {
	if src == "local" && (p == "~" || strings.HasPrefix(p, "~/")) {
		home, _ := os.UserHomeDir()
		return filepath.Join(home, p[1:])
	}
	return p
}

func (a *App) fs(src string) (transfer.FS, error) {
	if src == "local" {
		return transfer.Local{}, nil
	}
	c, err := a.sftpClient(src)
	if err != nil {
		return nil, err
	}
	return transfer.Remote{C: c}, nil
}

// List returns entries of dir on src; empty dir means home.
func (a *App) List(src, dir string) (*Listing, error) {
	dir = expandHome(src, dir)
	fs, err := a.fs(src)
	if err != nil {
		return nil, err
	}
	if r, ok := fs.(transfer.Remote); ok {
		if dir == "" {
			if dir, err = r.C.Getwd(); err != nil {
				return nil, err
			}
		}
		if dir, err = r.C.RealPath(dir); err != nil {
			return nil, err
		}
	} else {
		if dir == "" {
			dir, _ = os.UserHomeDir()
		}
		if dir, err = filepath.Abs(dir); err != nil {
			return nil, err
		}
	}
	infos, err := fs.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	out := make([]FileEntry, 0, len(infos))
	for _, fi := range infos {
		out = append(out, FileEntry{Name: fi.Name(), Size: fi.Size(), Mode: fi.Mode().String(), IsDir: fi.IsDir(), MTime: fi.ModTime().Unix()})
	}
	sort.Slice(out, func(i, j int) bool { // dirs first, then name
		if out[i].IsDir != out[j].IsDir {
			return out[i].IsDir
		}
		return out[i].Name < out[j].Name
	})
	return &Listing{Path: dir, Entries: out}, nil
}

func (a *App) Mkdir(src, dir string) error {
	fs, err := a.fs(src)
	if err != nil {
		return err
	}
	return fs.MkdirAll(dir)
}

func (a *App) Rename(src, from, to string) error {
	fs, err := a.fs(src)
	if err != nil {
		return err
	}
	if r, ok := fs.(transfer.Remote); ok {
		return r.C.Rename(from, to)
	}
	return os.Rename(from, to)
}

// Delete removes a file or an empty directory. Non-recursive on purpose.
func (a *App) Delete(src, p string) error {
	fs, err := a.fs(src)
	if err != nil {
		return err
	}
	return fs.Remove(p)
}

const maxEdit = 5 << 20

// ReadFile returns a text file for the editor. Refuses binary (NUL byte) and files over 5 MB.
func (a *App) ReadFile(src, p string) (string, error) {
	p = expandHome(src, p)
	fs, err := a.fs(src)
	if err != nil {
		return "", err
	}
	fi, err := fs.Stat(p)
	if err != nil {
		return "", err
	}
	if fi.Size() > maxEdit {
		return "", fmt.Errorf("%s is %d MB; the editor opens files up to 5 MB", fs.Base(p), fi.Size()>>20)
	}
	r, err := fs.Open(p)
	if err != nil {
		return "", err
	}
	defer r.Close()
	b, err := io.ReadAll(r)
	if err != nil {
		return "", err
	}
	if bytes.IndexByte(b, 0) >= 0 {
		return "", fmt.Errorf("%s looks binary; not opening in the editor", fs.Base(p))
	}
	return string(b), nil
}

// WriteFile saves atomically: write a sibling temp file, then rename over the target.
// A permission error comes back verbatim so the UI can offer "Save with sudo".
func (a *App) WriteFile(src, p, content string) error {
	p = expandHome(src, p)
	fs, err := a.fs(src)
	if err != nil {
		return err
	}
	tmp := p + ".spean-tmp"
	w, err := fs.Create(tmp)
	if err != nil {
		return err
	}
	if _, err = io.WriteString(w, content); err == nil {
		err = w.Close()
	} else {
		w.Close()
	}
	if err != nil {
		fs.Remove(tmp)
		return err
	}
	if fi, err := fs.Stat(p); err == nil {
		fs.Chmod(tmp, fi.Mode().Perm()) // keep the target's mode
	}
	if err := a.Rename(src, tmp, p); err != nil {
		fs.Remove(tmp)
		return err
	}
	return nil
}

// ReadHistory reads the remote shell history over SFTP, deduped and ranked by frequency.
func (a *App) ReadHistory(id string) ([]string, error) {
	c, err := a.sftpClient(id)
	if err != nil {
		return nil, err
	}
	home, _ := c.Getwd()
	count := map[string]int{}
	var order []string
	add := func(cmd string) {
		cmd = strings.TrimSpace(cmd)
		if cmd == "" || strings.HasPrefix(cmd, "_spean_cwd") {
			return
		}
		if count[cmd] == 0 {
			order = append(order, cmd)
		}
		count[cmd]++
	}
	for _, name := range []string{".zsh_history", ".bash_history", ".local/share/fish/fish_history"} {
		f, err := c.Open(path.Join(home, name))
		if err != nil {
			continue
		}
		sc := bufio.NewScanner(f)
		sc.Buffer(make([]byte, 1<<20), 1<<20)
		for sc.Scan() {
			line := sc.Text()
			switch {
			case strings.HasPrefix(line, ": ") && strings.Contains(line, ";"): // zsh extended: ": 1690000000:0;cmd"
				add(line[strings.Index(line, ";")+1:])
			case strings.HasPrefix(line, "- cmd: "): // fish yaml
				add(strings.TrimPrefix(line, "- cmd: "))
			case strings.HasPrefix(line, "#") || strings.HasPrefix(line, "  "): // bash timestamps, fish fields
			default:
				add(line)
			}
		}
		f.Close()
	}
	sort.SliceStable(order, func(i, j int) bool { return count[order[i]] > count[order[j]] })
	if len(order) > 500 {
		order = order[:500]
	}
	return order, nil
}

// ---- transfers ---------------------------------------------------------------

// Transfer queues a copy (or move) of from.paths into to.dir and returns the job id.
// Progress arrives as transfer:update events carrying the whole job.
func (a *App) Transfer(from, to transfer.Endpoint, move bool) string {
	return a.xfer.Start(from, to, move)
}

func (a *App) TransferCancel(id string)   { a.xfer.Cancel(id) }
func (a *App) TransferRetry(id string)    { a.xfer.Retry(id) }
func (a *App) Transfers() []*transfer.Job { return a.xfer.Jobs() }

// Download asks for a local folder, then copies the remote paths into it.
func (a *App) Download(src string, paths []string) (string, error) {
	dir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{Title: "Download to"})
	if err != nil || dir == "" {
		return "", err
	}
	return a.xfer.Start(transfer.Endpoint{Src: src, Paths: paths}, transfer.Endpoint{Src: "local", Dir: dir}, false), nil
}

// UploadPick opens a file picker and copies the chosen files into dir on src.
func (a *App) UploadPick(src, dir string) (string, error) {
	locals, err := runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{})
	if err != nil || len(locals) == 0 {
		return "", err
	}
	return a.xfer.Start(transfer.Endpoint{Src: "local", Paths: locals}, transfer.Endpoint{Src: src, Dir: dir}, false), nil
}
