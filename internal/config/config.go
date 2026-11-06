// Package config reads ~/.ssh/config and resolves ProxyJump chains.
package config

import (
	"bufio"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/kevinburke/ssh_config"
)

// Hop is one SSH endpoint in a chain.
type Hop struct {
	Alias         string   `json:"alias"`
	Addr          string   `json:"addr"` // host:port
	User          string   `json:"user"`
	IdentityFiles []string `json:"-"`
	ExplicitKey   bool     `json:"-"` // IdentityFile was set (saved host key or config), not the id_* defaults
	ForwardAgent  bool     `json:"-"`
	Snippet       string   `json:"-"`
}

// Get looks up an ssh_config value for an alias. Swappable for tests.
var Get = ssh_config.Get

// get checks Spean-saved hosts first, then ~/.ssh/config.
func get(alias, key string) string {
	if v, ok := savedGet(alias, key); ok {
		return v
	}
	return Get(alias, key)
}

func sshDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".ssh")
}

// Entry is one row in the host list.
type Entry struct {
	Alias       string   `json:"alias"`
	Group       string   `json:"group,omitempty"`
	Tags        []string `json:"tags,omitempty"`
	Saved       bool     `json:"saved"` // true = editable Spean host, false = from ~/.ssh/config
	HostName    string   `json:"hostName,omitempty"`
	User        string   `json:"user,omitempty"`
	Color       string   `json:"color,omitempty"`
	Starred     bool     `json:"starred,omitempty"`
	LastConnect int64    `json:"lastConnect,omitempty"`
	Theme       string   `json:"theme,omitempty"`
	HasNotes    bool     `json:"hasNotes,omitempty"`
	Order       int      `json:"-"`
}

// Hosts merges Spean-saved hosts with ~/.ssh/config aliases. Saved wins on name clash.
// Order: named groups first, then starred, then manual order, then name.
func Hosts() []Entry {
	var out []Entry
	seen := map[string]bool{}
	for _, h := range loadSaved() {
		out = append(out, Entry{Alias: h.Label, Group: h.Group, Tags: h.Tags, Saved: true, HostName: h.Address, User: h.User,
			Color: h.Color, Starred: h.Starred, LastConnect: h.LastConnect, Order: h.Order, Theme: h.Theme, HasNotes: h.Notes != ""})
		seen[h.Label] = true
	}
	for _, a := range configAliases() {
		if !seen[a] {
			mm := meta[a]
			out = append(out, Entry{Alias: a, HostName: Get(a, "HostName"), User: Get(a, "User"), Starred: mm.Starred, LastConnect: mm.LastConnect, HasNotes: mm.Notes != ""})
		}
	}
	sort.Slice(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if a.Group != b.Group { // named groups first, ungrouped last
			return b.Group == "" || (a.Group != "" && a.Group < b.Group)
		}
		if a.Starred != b.Starred {
			return a.Starred
		}
		if a.Order != b.Order {
			return b.Order == 0 || (a.Order != 0 && a.Order < b.Order)
		}
		return a.Alias < b.Alias
	})
	return out
}

// configAliases lists concrete Host aliases from ~/.ssh/config and every Include, recursively (depth 8).
func configAliases() []string {
	seen := map[string]bool{}
	var out []string
	files := []string{filepath.Join(sshDir(), "config")}
	visited := map[string]bool{files[0]: true}
	for i := 0; i < len(files) && i < 256; i++ {
		for _, inc := range includes(files[i]) {
			if !visited[inc] {
				visited[inc] = true
				files = append(files, inc)
			}
		}
	}
	for _, f := range files {
		r, err := os.Open(f)
		if err != nil {
			continue
		}
		cfg, err := ssh_config.Decode(r)
		r.Close()
		if err != nil {
			continue
		}
		for _, h := range cfg.Hosts {
			for _, p := range h.Patterns {
				s := p.String()
				if strings.ContainsAny(s, "*?!") || seen[s] {
					continue
				}
				seen[s] = true
				out = append(out, s)
			}
		}
	}
	sort.Strings(out)
	return out
}

func includes(path string) []string {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()
	var out []string
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		fields := strings.Fields(sc.Text())
		if len(fields) < 2 || !strings.EqualFold(fields[0], "Include") {
			continue
		}
		for _, pat := range fields[1:] {
			pat = strings.Trim(pat, `"`)
			if !filepath.IsAbs(pat) {
				pat = filepath.Join(sshDir(), pat)
			}
			m, _ := filepath.Glob(pat)
			out = append(out, m...)
		}
	}
	return out
}

// Resolve turns an alias (or literal user@host:port) into the jump hops and target.
func Resolve(alias string) (hops []Hop, target Hop, err error) {
	return resolve(alias, 0)
}

func resolve(alias string, depth int) ([]Hop, Hop, error) {
	if depth > 32 {
		return nil, Hop{}, fmt.Errorf("ProxyJump loop resolving %q", alias)
	}
	target := hop(alias)
	pj := get(alias, "ProxyJump")
	if pj == "" || pj == "none" {
		return nil, target, nil
	}
	// OpenSSH -J semantics: first jump's own ProxyJump is honoured, later ones are direct.
	jumps := strings.Split(pj, ",")
	hops, first, err := resolve(strings.TrimSpace(jumps[0]), depth+1)
	if err != nil {
		return nil, Hop{}, err
	}
	hops = append(hops, first)
	for _, j := range jumps[1:] {
		hops = append(hops, hop(strings.TrimSpace(j)))
	}
	return hops, target, nil
}

// hop builds a Hop from "[user@]host[:port]" merged with config values for the host part.
func hop(spec string) Hop {
	h := Hop{Alias: spec}
	name := spec
	if i := strings.LastIndex(name, "@"); i >= 0 {
		h.User, name = name[:i], name[i+1:]
	}
	port := ""
	if host, p, err := net.SplitHostPort(name); err == nil {
		name, port = host, p
	}
	h.Alias = name
	hostname := get(name, "HostName")
	if hostname == "" {
		hostname = name
	}
	if port == "" {
		port = get(name, "Port")
	}
	if port == "" {
		port = "22"
	}
	h.Addr = net.JoinHostPort(hostname, port)
	if h.User == "" {
		h.User = get(name, "User")
	}
	if h.User == "" {
		h.User = os.Getenv("USER")
	}
	h.IdentityFiles, h.ExplicitKey = identityFiles(name)
	h.ForwardAgent = strings.EqualFold(get(name, "ForwardAgent"), "yes")
	h.Snippet, _ = savedGet(name, "Snippet")
	return h
}

func identityFiles(alias string) ([]string, bool) {
	var files []string
	if k, ok := savedGet(alias, "IdentityFile"); ok {
		if k != "" {
			files = []string{k}
		}
	} else {
		files = ssh_config.GetAll(alias, "IdentityFile")
	}
	// ssh_config returns its own default "~/.ssh/identity" when unset; treat as unset.
	explicit := true
	if len(files) == 0 || (len(files) == 1 && files[0] == "~/.ssh/identity") {
		files = []string{"~/.ssh/id_ed25519", "~/.ssh/id_ecdsa", "~/.ssh/id_rsa"}
		explicit = false
	}
	home, _ := os.UserHomeDir()
	for i, f := range files {
		if strings.HasPrefix(f, "~/") {
			files[i] = filepath.Join(home, f[2:])
		}
	}
	return files, explicit
}
