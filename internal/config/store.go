package config

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// SavedHost is a host created in Spean's UI, kept apart from ~/.ssh/config (read-only).
type SavedHost struct {
	Label        string     `json:"label"`
	Address      string     `json:"address"`
	Port         string     `json:"port"`
	User         string     `json:"user"`
	Key          string     `json:"key"`  // identity file path
	Jump         string     `json:"jump"` // ProxyJump syntax: alias, label, or user@host:port, comma separated
	Group        string     `json:"group"`
	Tags         []string   `json:"tags"`
	ForwardAgent bool       `json:"forwardAgent"`
	Snippet      string     `json:"snippet"` // sent to the shell after login
	Favorites    []Favorite `json:"favorites,omitempty"`
	Color        string     `json:"color,omitempty"` // row label colour (hex)
	Starred      bool       `json:"starred,omitempty"`
	Order        int        `json:"order,omitempty"` // manual position inside the group
	LastConnect  int64      `json:"lastConnect,omitempty"`
	Forwards     []Forward  `json:"forwards,omitempty"`
	DockerSock   string     `json:"dockerSock,omitempty"` // remote socket path; "" = off
	Notes        string     `json:"notes,omitempty"`      // free text shown in the Notes pane
	Theme        string     `json:"theme,omitempty"`      // terminal theme preset override
}

// Forward is a saved port forward. Auto = start on connect.
type Forward struct {
	Kind   string `json:"kind"` // local | remote | dynamic
	Listen string `json:"listen"`
	Target string `json:"target"`
	Auto   bool   `json:"auto"`
}

// Favorite is one command on a host's chip strip. {{name}} placeholders prompt before typing.
type Favorite struct {
	Name string `json:"name"`
	Cmd  string `json:"cmd"`
	Run  bool   `json:"run"` // press Enter after typing
}

// hostMeta is Spean-side data for hosts that only exist in ~/.ssh/config (never written there).
type hostMeta struct {
	Favorites   []Favorite `json:"favorites,omitempty"`
	Starred     bool       `json:"starred,omitempty"`
	LastConnect int64      `json:"lastConnect,omitempty"`
	Notes       string     `json:"notes,omitempty"`
}

// storeVersion is the hosts.json format version. Bump only with a migration in loadSaved.
const storeVersion = 1

type store struct {
	Version  int                  `json:"version"`
	Hosts    []SavedHost          `json:"hosts"`
	Meta     map[string]hostMeta  `json:"meta,omitempty"` // keyed by ~/.ssh/config alias
	Snippets []Favorite           `json:"snippets,omitempty"`
	Groups   map[string]GroupMeta `json:"groups,omitempty"`
	Runbooks []Runbook            `json:"runbooks,omitempty"`
}

// Runbook is an ordered list of commands run one at a time on a host, with checkpoints.
type Runbook struct {
	Name  string `json:"name"`
	Steps []Step `json:"steps"`
}

type Step struct {
	Cmd     string `json:"cmd"`
	Note    string `json:"note,omitempty"`    // shown before the step
	Confirm bool   `json:"confirm,omitempty"` // wait for the user before running this step
}

// GroupMeta marks a group as a cluster and remembers its nodes.
type GroupMeta struct {
	Kind  string            `json:"kind,omitempty"` // "" | swarm
	Nodes []Node            `json:"nodes,omitempty"`
	Map   map[string]string `json:"map,omitempty"` // node hostname → Spean alias (manual overrides)
}

// Node is one `docker node ls` row.
type Node struct {
	ID       string `json:"id"`
	Hostname string `json:"hostname"`
	Role     string `json:"role"` // manager | worker
	Status   string `json:"status"`
	Avail    string `json:"availability"`
	Alias    string `json:"alias,omitempty"` // matched Spean host
}

var (
	meta     map[string]hostMeta
	snippets []Favorite
	groups   map[string]GroupMeta
	runbooks []Runbook
)

var (
	savedMu sync.Mutex
	saved   map[string]SavedHost
)

// storePath is a var so tests can point it at a temp dir.
var storePath = func() string {
	dir, _ := os.UserConfigDir()
	return filepath.Join(dir, "spean", "hosts.json")
}

func loadSaved() map[string]SavedHost {
	savedMu.Lock()
	defer savedMu.Unlock()
	if saved != nil {
		return saved
	}
	saved = map[string]SavedHost{}
	b, err := os.ReadFile(storePath())
	if err != nil {
		return saved
	}
	var st store
	if bytes.HasPrefix(bytes.TrimSpace(b), []byte("[")) { // pre-v0.5: bare array
		json.Unmarshal(b, &st.Hosts)
		os.WriteFile(storePath()+".bak", b, 0600) // ponytail: .bak kept forever, not just until next launch
		writeSaved(index(st.Hosts))
	} else {
		json.Unmarshal(b, &st)
		if st.Version > storeVersion {
			storeErr = fmt.Errorf("hosts.json is version %d; this Spean reads up to %d. Update Spean.", st.Version, storeVersion)
			return saved
		}
	}
	saved = index(st.Hosts)
	meta, snippets, groups, runbooks = st.Meta, st.Snippets, st.Groups, st.Runbooks
	if meta == nil {
		meta = map[string]hostMeta{}
	}
	if groups == nil {
		groups = map[string]GroupMeta{}
	}
	return saved
}

// storeErr blocks writes when hosts.json comes from a newer Spean (downgrade protection).
var storeErr error

func index(list []SavedHost) map[string]SavedHost {
	m := make(map[string]SavedHost, len(list))
	for _, h := range list {
		m[h.Label] = h
	}
	return m
}

// MergeStore folds another hosts.json (any supported version) into this one: hosts, meta,
// snippets and groups by name, imported entries winning. Returns hosts merged.
func MergeStore(raw []byte) (int, error) {
	if len(raw) == 0 {
		return 0, nil
	}
	m := loadSaved()
	if storeErr != nil {
		return 0, storeErr
	}
	var st store
	if bytes.HasPrefix(bytes.TrimSpace(raw), []byte("[")) {
		json.Unmarshal(raw, &st.Hosts)
	} else if err := json.Unmarshal(raw, &st); err != nil {
		return 0, err
	}
	savedMu.Lock()
	defer savedMu.Unlock()
	for _, h := range st.Hosts {
		if h.Label != "" {
			m[h.Label] = h
		}
	}
	for k, v := range st.Meta {
		meta[k] = v
	}
	for k, v := range st.Groups {
		groups[k] = v
	}
	for _, rb := range st.Runbooks {
		dup := false
		for i, cur := range runbooks {
			if cur.Name == rb.Name {
				runbooks[i], dup = rb, true
			}
		}
		if !dup {
			runbooks = append(runbooks, rb)
		}
	}
	for _, sn := range st.Snippets {
		dup := false
		for i, cur := range snippets {
			if cur.Name == sn.Name {
				snippets[i], dup = sn, true
			}
		}
		if !dup {
			snippets = append(snippets, sn)
		}
	}
	return len(st.Hosts), writeSaved(m)
}

var lastBackup time.Time

// backup keeps the last 5 hosts.json versions under backups/, at most one per 10 minutes
// (Touch writes on every connect; those are not worth a copy each).
func backup() {
	if time.Since(lastBackup) < 10*time.Minute {
		return
	}
	cur, err := os.ReadFile(storePath())
	if err != nil {
		return
	}
	lastBackup = time.Now()
	dir := filepath.Join(filepath.Dir(storePath()), "backups")
	os.MkdirAll(dir, 0700)
	os.WriteFile(filepath.Join(dir, "hosts-"+time.Now().Format("20060102-150405")+".json"), cur, 0600)
	old, _ := filepath.Glob(filepath.Join(dir, "hosts-*.json"))
	sort.Strings(old)
	for len(old) > 5 {
		os.Remove(old[0])
		old = old[1:]
	}
}

func writeSaved(m map[string]SavedHost) error {
	backup()
	list := make([]SavedHost, 0, len(m))
	for _, h := range m {
		list = append(list, h)
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Label < list[j].Label })
	b, _ := json.MarshalIndent(store{Version: storeVersion, Hosts: list, Meta: meta, Snippets: snippets, Groups: groups, Runbooks: runbooks}, "", "  ")
	os.MkdirAll(filepath.Dir(storePath()), 0700)
	return os.WriteFile(storePath(), b, 0600)
}

// Lookup returns a saved host by label, or nil.
func Lookup(label string) *SavedHost {
	if h, ok := loadSaved()[label]; ok {
		return &h
	}
	return nil
}

// SaveHost inserts or replaces by label.
func SaveHost(h SavedHost) error {
	h.Label = strings.TrimSpace(h.Label)
	h.Address = strings.TrimSpace(h.Address)
	if h.Label == "" || h.Address == "" {
		return errors.New("label and address are required")
	}
	m := loadSaved()
	if storeErr != nil {
		return storeErr
	}
	savedMu.Lock()
	defer savedMu.Unlock()
	m[h.Label] = h
	return writeSaved(m)
}

// DeleteHost removes a saved host by label.
func DeleteHost(label string) error {
	m := loadSaved()
	if storeErr != nil {
		return storeErr
	}
	savedMu.Lock()
	defer savedMu.Unlock()
	delete(m, label)
	return writeSaved(m)
}

// savedGet exposes a SavedHost through the same key names ssh_config uses,
// so Resolve treats saved and config hosts identically.
func savedGet(alias, key string) (string, bool) {
	h, ok := loadSaved()[alias]
	if !ok {
		return "", false
	}
	switch strings.ToLower(key) {
	case "hostname":
		return h.Address, true
	case "port":
		return h.Port, true
	case "user":
		return h.User, true
	case "identityfile":
		return h.Key, true
	case "proxyjump":
		return h.Jump, true
	case "forwardagent":
		if h.ForwardAgent {
			return "yes", true
		}
		return "no", true
	case "snippet":
		return h.Snippet, true
	}
	return "", true
}

// Favorites returns the chip-strip commands for a saved label or a config alias.
func Favorites(alias string) []Favorite {
	m := loadSaved()
	if h, ok := m[alias]; ok {
		return h.Favorites
	}
	return meta[alias].Favorites
}

// SetFavorites stores favorites on the saved host, or in meta for config-only aliases.
func SetFavorites(alias string, favs []Favorite) error {
	m := loadSaved()
	if storeErr != nil {
		return storeErr
	}
	savedMu.Lock()
	defer savedMu.Unlock()
	if h, ok := m[alias]; ok {
		h.Favorites = favs
		m[alias] = h
	} else if len(favs) == 0 {
		delete(meta, alias)
	} else {
		meta[alias] = hostMeta{Favorites: favs}
	}
	return writeSaved(m)
}

// Touch records a successful connection time.
func Touch(alias string) {
	m := loadSaved()
	savedMu.Lock()
	defer savedMu.Unlock()
	now := time.Now().Unix()
	if h, ok := m[alias]; ok {
		h.LastConnect = now
		m[alias] = h
	} else if _, ok := meta[alias]; ok || Get(alias, "HostName") != "" {
		mm := meta[alias]
		mm.LastConnect = now
		meta[alias] = mm
	} else {
		return // literal user@host: nothing to remember
	}
	writeSaved(m)
}

// Star toggles the favourite flag on a saved host or config alias.
func Star(alias string, on bool) error {
	m := loadSaved()
	if storeErr != nil {
		return storeErr
	}
	savedMu.Lock()
	defer savedMu.Unlock()
	if h, ok := m[alias]; ok {
		h.Starred = on
		m[alias] = h
	} else {
		mm := meta[alias]
		mm.Starred = on
		meta[alias] = mm
	}
	return writeSaved(m)
}

// Reorder stores the manual order of saved labels (index = position).
func Reorder(labels []string) error {
	m := loadSaved()
	if storeErr != nil {
		return storeErr
	}
	savedMu.Lock()
	defer savedMu.Unlock()
	for i, l := range labels {
		if h, ok := m[l]; ok {
			h.Order = i + 1
			m[l] = h
		}
	}
	return writeSaved(m)
}

func Snippets() []Favorite { loadSaved(); return snippets }

func SetSnippets(s []Favorite) error {
	m := loadSaved()
	if storeErr != nil {
		return storeErr
	}
	savedMu.Lock()
	defer savedMu.Unlock()
	snippets = s
	return writeSaved(m)
}

func Groups() map[string]GroupMeta { loadSaved(); return groups }

func SetGroup(name string, g GroupMeta) error {
	m := loadSaved()
	if storeErr != nil {
		return storeErr
	}
	savedMu.Lock()
	defer savedMu.Unlock()
	if g.Kind == "" && len(g.Nodes) == 0 && len(g.Map) == 0 {
		delete(groups, name)
	} else {
		groups[name] = g
	}
	return writeSaved(m)
}

func Notes(alias string) string {
	m := loadSaved()
	if h, ok := m[alias]; ok {
		return h.Notes
	}
	return meta[alias].Notes
}

func SetNotes(alias, text string) error {
	m := loadSaved()
	if storeErr != nil {
		return storeErr
	}
	savedMu.Lock()
	defer savedMu.Unlock()
	if h, ok := m[alias]; ok {
		h.Notes = text
		m[alias] = h
	} else {
		mm := meta[alias]
		mm.Notes = text
		meta[alias] = mm
	}
	return writeSaved(m)
}

func Runbooks() []Runbook { loadSaved(); return runbooks }

func SetRunbooks(r []Runbook) error {
	m := loadSaved()
	if storeErr != nil {
		return storeErr
	}
	savedMu.Lock()
	defer savedMu.Unlock()
	runbooks = r
	return writeSaved(m)
}
