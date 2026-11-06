package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	goruntime "runtime"
	"sort"
	"strconv"
	"strings"

	"spean/internal/forward"
)

// ---- port forwards ----------------------------------------------------------

// ForwardStart opens a forward on a connected tab. kind: local | remote | dynamic.
func (a *App) ForwardStart(id, kind, listen, target string) (*forward.Forward, error) {
	t := a.get(id)
	if t == nil || t.chain == nil {
		return nil, errors.New("tab not connected")
	}
	return a.fwd.Start(id, kind, listen, target, t.chain.Client())
}

func (a *App) ForwardStop(fid string) { a.fwd.Stop(fid) }

func (a *App) Forwards() []*forward.Forward { return a.fwd.List() }

// ---- docker socket over ssh -------------------------------------------------

var unsafe = regexp.MustCompile(`[^A-Za-z0-9_.-]+`)

func dockerSockPath(label string) string {
	name := unsafe.ReplaceAllString(label, "_")
	if goruntime.GOOS == "windows" {
		return `\\.\pipe\spean-` + name
	}
	dir, _ := os.UserConfigDir()
	p := filepath.Join(dir, "spean", "sock")
	os.MkdirAll(p, 0700)
	return filepath.Join(p, name+".sock")
}

// DockerStart bridges the remote Docker socket to a local unix socket for this tab.
func (a *App) DockerStart(id, alias, remoteSock string) (*forward.Forward, error) {
	t := a.get(id)
	if t == nil || t.chain == nil {
		return nil, errors.New("tab not connected")
	}
	if remoteSock == "" {
		remoteSock = "/var/run/docker.sock"
	}
	return a.fwd.Start(id, "docker", dockerSockPath(alias), remoteSock, t.chain.Client())
}

// DockerHost returns the DOCKER_HOST value for a label (valid while the bridge runs).
func (a *App) DockerHost(alias string) string {
	if goruntime.GOOS == "windows" {
		return "npipe:////./pipe/spean-" + unsafe.ReplaceAllString(alias, "_")
	}
	return "unix://" + dockerSockPath(alias)
}

// DockerContextCreate runs `docker context create spean-<label>` pointing at the bridge.
func (a *App) DockerContextCreate(alias string) (string, error) {
	name := "spean-" + unsafe.ReplaceAllString(alias, "_")
	out, err := exec.Command("docker", "context", "create", name, "--docker", "host="+a.DockerHost(alias)).CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("%s: %w", string(out), err)
	}
	return fmt.Sprintf("created; use it with: docker context use %s", name), nil
}

// ---- listening ports on the host (v0.22) ----------------------------------------

type ListenPort struct {
	Addr string `json:"addr"` // bind address, e.g. 0.0.0.0 or 127.0.0.1
	Port int    `json:"port"`
	Proc string `json:"proc,omitempty"`
}

var (
	ssRe      = regexp.MustCompile(`^LISTEN\s+\S+\s+\S+\s+(\S+):(\d+)\s+\S+(?:\s+users:\(\("([^"]+)")?`)
	netstatRe = regexp.MustCompile(`^tcp6?\s+\d+\s+\d+\s+(\S+):(\d+)\s+\S+\s+LISTEN\s*(?:\d+/(\S+))?`)
)

// ListenPorts lists TCP listeners on the tab's host via ss (or netstat), deduped by port.
func (a *App) ListenPorts(id string) ([]ListenPort, error) {
	t := a.get(id)
	if t == nil || t.chain == nil {
		return nil, errors.New("tab not connected")
	}
	r, err := execOn(t.chain.Client(), "ss -Hltnp 2>/dev/null || netstat -tlnp 2>/dev/null || netstat -tln 2>/dev/null")
	if err != nil {
		return nil, err
	}
	seen := map[int]int{}
	var out []ListenPort
	for _, line := range strings.Split(r.Stdout, "\n") {
		line = strings.TrimSpace(line)
		m := ssRe.FindStringSubmatch(line)
		if m == nil {
			m = netstatRe.FindStringSubmatch(line)
		}
		if m == nil {
			continue
		}
		port, _ := strconv.Atoi(m[2])
		addr := strings.Trim(m[1], "[]")
		if addr == "*" || addr == "::" {
			addr = "0.0.0.0"
		}
		if i, ok := seen[port]; ok {
			if out[i].Proc == "" && len(m) > 3 {
				out[i].Proc = m[3]
			}
			continue
		}
		seen[port] = len(out)
		p := ListenPort{Addr: addr, Port: port}
		if len(m) > 3 {
			p.Proc = m[3]
		}
		out = append(out, p)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Port < out[j].Port })
	return out, nil
}
