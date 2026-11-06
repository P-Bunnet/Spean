package config

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestResolve(t *testing.T) {
	fake := map[string]map[string]string{
		"c":    {"HostName": "c.internal", "ProxyJump": "b", "User": "root"},
		"b":    {"HostName": "b.dmz", "ProxyJump": "a", "Port": "2200"},
		"a":    {"HostName": "a.edge"},
		"d":    {"ProxyJump": "a,b"},
		"loop": {"ProxyJump": "loop"},
	}
	Get = func(alias, key string) string { return fake[alias][key] }

	hops, target, err := Resolve("c")
	if err != nil {
		t.Fatal(err)
	}
	got := []string{}
	for _, h := range hops {
		got = append(got, h.Addr)
	}
	if want := "a.edge:22,b.dmz:2200"; strings.Join(got, ",") != want {
		t.Fatalf("hops = %v, want %s", got, want)
	}
	if target.Addr != "c.internal:22" || target.User != "root" {
		t.Fatalf("target = %+v", target)
	}

	// list form: first jump recursed, second direct
	hops, _, _ = Resolve("d")
	if len(hops) != 2 || hops[0].Addr != "a.edge:22" || hops[1].Addr != "b.dmz:2200" {
		t.Fatalf("list hops = %+v", hops)
	}

	// literal, not in config
	hops, target, _ = Resolve("admin@10.0.0.5:2222")
	if len(hops) != 0 || target.Addr != "10.0.0.5:2222" || target.User != "admin" {
		t.Fatalf("literal = %+v %+v", hops, target)
	}

	if _, _, err := Resolve("loop"); err == nil {
		t.Fatal("expected loop error")
	}
}

func TestSavedHostResolve(t *testing.T) {
	dir := t.TempDir()
	storePath = func() string { return dir + "/hosts.json" }
	saved = nil
	Get = func(alias, key string) string {
		if alias == "a" && key == "HostName" {
			return "a.edge"
		}
		return ""
	}
	if err := SaveHost(SavedHost{Label: "prod db", Address: "10.0.0.9", Port: "5522", User: "dba",
		Jump: "a", Group: "prod", ForwardAgent: true, Snippet: "tmux a"}); err != nil {
		t.Fatal(err)
	}
	saved = nil // force reload from disk
	hops, target, err := Resolve("prod db")
	if err != nil {
		t.Fatal(err)
	}
	if len(hops) != 1 || hops[0].Addr != "a.edge:22" {
		t.Fatalf("hops = %+v", hops)
	}
	if target.Addr != "10.0.0.9:5522" || target.User != "dba" || !target.ForwardAgent || target.Snippet != "tmux a" {
		t.Fatalf("target = %+v", target)
	}
	found := false
	for _, e := range Hosts() { // real ~/.ssh/config entries are merged in too
		found = found || (e.Alias == "prod db" && e.Group == "prod" && e.Saved)
	}
	if !found {
		t.Fatal("saved host missing from Hosts()")
	}
	DeleteHost("prod db")
	if len(loadSaved()) != 0 {
		t.Fatal("delete failed")
	}
}

func TestStoreMigrateBareArray(t *testing.T) {
	dir := t.TempDir()
	storePath = func() string { return dir + "/hosts.json" }
	saved = nil
	os.WriteFile(storePath(), []byte(`[{"label":"old","address":"1.2.3.4"}]`), 0600)
	if h := Lookup("old"); h == nil || h.Address != "1.2.3.4" {
		t.Fatalf("legacy host not loaded: %+v", h)
	}
	if _, err := os.Stat(storePath() + ".bak"); err != nil {
		t.Fatal("no .bak written")
	}
	b, _ := os.ReadFile(storePath())
	var st store
	json.Unmarshal(b, &st)
	if st.Version != storeVersion || len(st.Hosts) != 1 {
		t.Fatalf("not rewritten as wrapped store: %s", b)
	}

	// newer version: readable but refuses writes
	saved, storeErr = nil, nil
	os.WriteFile(storePath(), []byte(`{"version":99,"hosts":[]}`), 0600)
	if err := SaveHost(SavedHost{Label: "x", Address: "y"}); err == nil {
		t.Fatal("expected downgrade-protection error")
	}
	saved, storeErr = nil, nil
}
