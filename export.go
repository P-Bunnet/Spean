package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"spean/internal/config"
)

// ---- export / import -----------------------------------------------------------
// One JSON with everything Spean owns. The vault travels as its encrypted file (opaque);
// it unlocks on the other machine with the same master password.

type bundle struct {
	Version  int             `json:"version"`
	App      string          `json:"app"`
	At       string          `json:"exportedAt"`
	Hosts    json.RawMessage `json:"hosts,omitempty"`    // hosts.json as is
	Settings json.RawMessage `json:"settings,omitempty"` // settings.json as is
	Vault    json.RawMessage `json:"vault,omitempty"`    // vault.json as is (encrypted)
}

func dataDir() string {
	dir, _ := os.UserConfigDir()
	return filepath.Join(dir, "spean")
}

func (a *App) DataDir() string { return dataDir() }

// OpenDataDir reveals the data folder in the OS file manager.
func (a *App) OpenDataDir() error {
	d := dataDir()
	os.MkdirAll(d, 0700)
	var cmd *exec.Cmd
	switch goruntime.GOOS {
	case "darwin":
		cmd = exec.Command("open", d)
	case "windows":
		cmd = exec.Command("explorer", d)
	default:
		cmd = exec.Command("xdg-open", d)
	}
	return cmd.Start()
}

// ExportAll writes the bundle where the user chooses and returns the path.
func (a *App) ExportAll() (string, error) {
	p, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{DefaultFilename: "spean-export-" + time.Now().Format("2006-01-02") + ".json"})
	if err != nil || p == "" {
		return "", err
	}
	b := bundle{Version: 1, App: "spean", At: time.Now().Format(time.RFC3339)}
	read := func(name string) json.RawMessage {
		raw, err := os.ReadFile(filepath.Join(dataDir(), name))
		if err != nil || !json.Valid(raw) {
			return nil
		}
		return raw
	}
	b.Hosts, b.Settings, b.Vault = read("hosts.json"), read("settings.json"), read("vault.json")
	out, _ := json.MarshalIndent(b, "", "  ")
	return p, os.WriteFile(p, out, 0600)
}

// ImportAll merges a bundle: hosts/snippets/groups/meta by name (imported wins), settings only
// when none exist yet, vault only when none exists yet. Returns a one-line summary.
func (a *App) ImportAll() (string, error) {
	p, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{Filters: []runtime.FileFilter{{DisplayName: "Spean export", Pattern: "*.json"}}})
	if err != nil || p == "" {
		return "", err
	}
	raw, err := os.ReadFile(p)
	if err != nil {
		return "", err
	}
	var b bundle
	if err := json.Unmarshal(raw, &b); err != nil || b.App != "spean" {
		return "", errors.New("not a Spean export")
	}
	if b.Version > 1 {
		return "", errors.New("export is from a newer Spean")
	}
	n, err := config.MergeStore(b.Hosts)
	if err != nil {
		return "", err
	}
	msg := fmt.Sprintf("%d host(s) merged", n)
	if len(b.Settings) > 0 {
		if _, err := os.Stat(filepath.Join(dataDir(), "settings.json")); os.IsNotExist(err) {
			os.WriteFile(filepath.Join(dataDir(), "settings.json"), b.Settings, 0600)
			msg += ", settings imported"
		}
	}
	if len(b.Vault) > 0 {
		if a.vault.Exists() {
			msg += ", vault skipped (one already exists)"
		} else {
			os.WriteFile(filepath.Join(dataDir(), "vault.json"), b.Vault, 0600)
			msg += ", vault imported (unlock with its master password)"
		}
	}
	return msg, nil
}
