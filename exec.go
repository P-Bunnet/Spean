package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/crypto/ssh"

	"spean/internal/config"
	"spean/internal/sshx"
)

// ---- non-PTY exec ------------------------------------------------------------

type ExecResult struct {
	Stdout string `json:"stdout"`
	Stderr string `json:"stderr"`
	Exit   int    `json:"exit"`
}

func execOn(client *ssh.Client, cmd string) (*ExecResult, error) {
	s, err := client.NewSession()
	if err != nil {
		return nil, err
	}
	defer s.Close()
	var out, errb bytes.Buffer
	s.Stdout, s.Stderr = &out, &errb
	err = s.Run(cmd)
	r := &ExecResult{Stdout: out.String(), Stderr: errb.String()}
	var ee *ssh.ExitError
	if errors.As(err, &ee) {
		r.Exit = ee.ExitStatus()
	} else if err != nil {
		return nil, err
	}
	return r, nil
}

// Exec runs cmd on a connected tab's host without a PTY (tables, JSON, scripts).
func (a *App) Exec(id, cmd string) (*ExecResult, error) {
	t := a.get(id)
	if t == nil || t.chain == nil {
		return nil, errors.New("tab not connected")
	}
	return execOn(t.chain.Client(), cmd)
}

// clientFor reuses a live tab's chain for alias, else dials a temporary one (closed by the caller).
func (a *App) clientFor(alias string) (*ssh.Client, func(), error) {
	a.mu.Lock()
	for _, t := range a.tabs {
		if t.chain != nil && t.alias == alias {
			a.mu.Unlock()
			return t.chain.Client(), func() {}, nil
		}
	}
	a.mu.Unlock()
	hops, target, err := config.Resolve(alias)
	if err != nil {
		return nil, nil, err
	}
	chain, err := sshx.DialChain(hops, target, a, func(string, string, error) {})
	if err != nil {
		return nil, nil, err
	}
	return chain.Client(), chain.Close, nil
}

// MultiExec runs cmd on every alias concurrently. Output streams as exec:<runId> events
// {alias, data?, done?, exit?, err?}. Returns the run id.
func (a *App) MultiExec(aliases []string, cmd string) string {
	a.mu.Lock()
	a.nextID++
	run := fmt.Sprint("x", a.nextID)
	a.mu.Unlock()
	emit := func(m map[string]any) { runtime.EventsEmit(a.ctx, "exec:"+run, m) }
	go func() {
		var wg sync.WaitGroup
		for _, alias := range aliases {
			wg.Add(1)
			go func(alias string) {
				defer wg.Done()
				client, done, err := a.clientFor(alias)
				if err != nil {
					emit(map[string]any{"alias": alias, "done": true, "err": err.Error()})
					return
				}
				defer done()
				s, err := client.NewSession()
				if err != nil {
					emit(map[string]any{"alias": alias, "done": true, "err": err.Error()})
					return
				}
				defer s.Close()
				w := writerFunc(func(b []byte) { emit(map[string]any{"alias": alias, "data": string(b)}) })
				s.Stdout, s.Stderr = w, w
				err = s.Run(cmd)
				exit := 0
				var ee *ssh.ExitError
				if errors.As(err, &ee) {
					exit = ee.ExitStatus()
				} else if err != nil {
					emit(map[string]any{"alias": alias, "done": true, "err": err.Error()})
					return
				}
				emit(map[string]any{"alias": alias, "done": true, "exit": exit})
			}(alias)
		}
		wg.Wait()
		emit(map[string]any{"all": true})
	}()
	return run
}

type writerFunc func([]byte)

func (f writerFunc) Write(b []byte) (int, error) {
	out := make([]byte, len(b))
	copy(out, b)
	f(out)
	return len(b), nil
}

// ---- snippets (global favorites) ----------------------------------------------

func (a *App) Snippets() []config.Favorite { return config.Snippets() }

func (a *App) SetSnippets(s []config.Favorite) error { return config.SetSnippets(s) }

// ---- session restore -----------------------------------------------------------

type SessionTab struct {
	Alias string `json:"alias"`
	Local bool   `json:"local,omitempty"`
}

func sessionPath() string {
	dir, _ := os.UserConfigDir()
	return filepath.Join(dir, "spean", "session.json")
}

// SaveSession is called by the frontend whenever tabs change; restored at next launch if asked.
func (a *App) SaveSession(tabs []SessionTab) error {
	b, _ := json.Marshal(tabs)
	os.MkdirAll(filepath.Dir(sessionPath()), 0700)
	return os.WriteFile(sessionPath(), b, 0600)
}

func (a *App) LastSession() []SessionTab {
	var out []SessionTab
	b, err := os.ReadFile(sessionPath())
	if err == nil {
		json.Unmarshal(b, &out)
	}
	return out
}

// ---- session logging -----------------------------------------------------------

// LogStart writes the tab's output to <data dir>/logs/<alias>-<time>.log, each line stamped.
func (a *App) LogStart(id string) (string, error) {
	t := a.get(id)
	if t == nil {
		return "", errors.New("tab not connected")
	}
	dir, _ := os.UserConfigDir()
	dir = filepath.Join(dir, "spean", "logs")
	os.MkdirAll(dir, 0700)
	p := filepath.Join(dir, fmt.Sprintf("%s-%s.log", unsafe.ReplaceAllString(t.alias, "_"), time.Now().Format("2006-01-02-150405")))
	f, err := os.OpenFile(p, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
	if err != nil {
		return "", err
	}
	a.mu.Lock()
	t.log = &logWriter{f: f, bol: true}
	a.mu.Unlock()
	return p, nil
}

func (a *App) LogStop(id string) {
	t := a.get(id)
	if t == nil {
		return
	}
	a.mu.Lock()
	if t.log != nil {
		t.log.f.Close()
		t.log = nil
	}
	a.mu.Unlock()
}

// logWriter strips ANSI escapes and stamps the start of every line.
type logWriter struct {
	f   *os.File
	bol bool
}

var ansi = regexp.MustCompile(`\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07|\x1b[()][A-Za-z0-9]|\r`)

func (l *logWriter) Write(b []byte) {
	s := ansi.ReplaceAllString(string(b), "")
	stamp := time.Now().Format("[15:04:05] ")
	var out strings.Builder
	for _, r := range s {
		if l.bol {
			out.WriteString(stamp)
			l.bol = false
		}
		out.WriteRune(r)
		if r == '\n' {
			l.bol = true
		}
	}
	l.f.WriteString(out.String())
}

// ---- cluster groups ------------------------------------------------------------

func (a *App) Groups() map[string]config.GroupMeta { return config.Groups() }

func (a *App) SetGroup(name string, g config.GroupMeta) error { return config.SetGroup(name, g) }

// ClusterDetect runs `docker node ls` on any member of the group and caches the node list,
// matching node hostnames to Spean hosts by label, HostName, or the group's manual map.
func (a *App) ClusterDetect(group string) (*config.GroupMeta, error) {
	var members []config.Entry
	for _, h := range config.Hosts() {
		if h.Group == group {
			members = append(members, h)
		}
	}
	if len(members) == 0 {
		return nil, errors.New("group has no hosts")
	}
	g := config.Groups()[group]
	var out string
	var lastErr error
	for _, m := range members { // first member that answers wins
		client, done, err := a.clientFor(m.Alias)
		if err != nil {
			lastErr = err
			continue
		}
		r, err := execOn(client, "docker node ls --format '{{json .}}'")
		done()
		if err != nil || r.Exit != 0 {
			lastErr = fmt.Errorf("%s: %s", m.Alias, strings.TrimSpace(r.Stderr))
			continue
		}
		out = r.Stdout
		break
	}
	if out == "" {
		return nil, fmt.Errorf("no member answered docker node ls: %v", lastErr)
	}
	g.Kind = "swarm"
	g.Nodes = nil
	for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
		var row struct{ ID, Hostname, ManagerStatus, Status, Availability string }
		if json.Unmarshal([]byte(line), &row) != nil {
			continue
		}
		n := config.Node{ID: row.ID, Hostname: row.Hostname, Role: "worker", Status: row.Status, Avail: row.Availability}
		if row.ManagerStatus != "" {
			n.Role = "manager"
		}
		if alias, ok := g.Map[row.Hostname]; ok {
			n.Alias = alias
		} else {
			for _, m := range members {
				if m.Alias == row.Hostname || m.HostName == row.Hostname || strings.HasPrefix(m.HostName, row.Hostname+".") {
					n.Alias = m.Alias
				}
			}
		}
		g.Nodes = append(g.Nodes, n)
	}
	return &g, config.SetGroup(group, g)
}

// ClusterManager picks a manager to run swarm commands on: one with a live tab, else the first known.
func (a *App) ClusterManager(group string) string {
	g := config.Groups()[group]
	first := ""
	for _, n := range g.Nodes {
		if n.Role != "manager" || n.Alias == "" {
			continue
		}
		if first == "" {
			first = n.Alias
		}
		a.mu.Lock()
		for _, t := range a.tabs {
			if t.alias == n.Alias && t.chain != nil {
				a.mu.Unlock()
				return n.Alias
			}
		}
		a.mu.Unlock()
	}
	return first
}
