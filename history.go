package main

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// ---- command history across hosts ----------------------------------------------
// Every command Spean types into a remote shell (favorites, runbooks, palette) lands in <data dir>/history.jsonl.
// ponytail: append-only file read on demand; last 20k lines kept in memory. No index.

type HistEntry struct {
	Host string `json:"host"`
	Cwd  string `json:"cwd,omitempty"`
	Cmd  string `json:"cmd"`
	Exit int    `json:"exit"`
	At   int64  `json:"at"`
	N    int    `json:"n,omitempty"` // how many times seen (search results only)
}

var histMu sync.Mutex

func historyPath() string {
	dir, _ := os.UserConfigDir()
	return filepath.Join(dir, "spean", "history.jsonl")
}

func (a *App) HistoryAdd(host, cwd, cmd string, exit int) {
	cmd = strings.TrimSpace(cmd)
	if cmd == "" || strings.HasPrefix(cmd, " ") {
		return
	}
	histMu.Lock()
	defer histMu.Unlock()
	os.MkdirAll(filepath.Dir(historyPath()), 0700)
	f, err := os.OpenFile(historyPath(), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
	if err != nil {
		return
	}
	defer f.Close()
	b, _ := json.Marshal(HistEntry{Host: host, Cwd: cwd, Cmd: cmd, Exit: exit, At: time.Now().Unix()})
	f.Write(append(b, '\n'))
}

// HistorySearch returns the most recent distinct commands matching every word of q (any host when host == "").
func (a *App) HistorySearch(q, host string, limit int) []HistEntry {
	histMu.Lock()
	defer histMu.Unlock()
	f, err := os.Open(historyPath())
	if err != nil {
		return nil
	}
	defer f.Close()
	words := strings.Fields(strings.ToLower(q))
	latest := map[string]*HistEntry{}
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 1<<20), 1<<20)
	for sc.Scan() {
		var e HistEntry
		if json.Unmarshal(sc.Bytes(), &e) != nil || (host != "" && e.Host != host) {
			continue
		}
		lc := strings.ToLower(e.Cmd)
		ok := true
		for _, w := range words {
			if !strings.Contains(lc, w) && !strings.Contains(strings.ToLower(e.Host), w) {
				ok = false
				break
			}
		}
		if !ok {
			continue
		}
		key := e.Host + "\x00" + e.Cmd
		if p := latest[key]; p != nil {
			e.N = p.N + 1
		} else {
			e.N = 1
		}
		latest[key] = &e
	}
	out := make([]HistEntry, 0, len(latest))
	for _, e := range latest {
		out = append(out, *e)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].At > out[j].At })
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out
}
