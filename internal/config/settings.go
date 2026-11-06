package config

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
)

// Settings is settings.json. Frontend owns the terminal look; backend reads the rest.
type Settings struct {
	Version       int    `json:"version"`
	FontFamily    string `json:"fontFamily"`
	FontSize      int    `json:"fontSize"`
	Theme         string `json:"theme"` // preset name, see themes in frontend/src/lib/settings.ts
	Scrollback    int    `json:"scrollback"`
	CursorStyle   string `json:"cursorStyle"` // block | underline | bar
	CursorBlink   bool   `json:"cursorBlink"`
	Bell          bool   `json:"bell"` // visual flash on BEL
	KeepaliveSec  int    `json:"keepaliveSec"`
	ConfirmClose  bool   `json:"confirmClose"`  // ask before closing a live tab
	Concurrency   int    `json:"concurrency"`   // parallel transfers; applies at next launch
	Onboarded     bool   `json:"onboarded"`     // first-run screens shown
	Restore       string `json:"restore"`       // "" = ask, yes | no: reopen last session's tabs
	AutoReconnect bool   `json:"autoReconnect"` // after a dropped connection (not a clean exit), retry with backoff
	CopyOnSelect  bool   `json:"copyOnSelect"`  // selecting text in the terminal copies it
	Keychain      bool   `json:"keychain"`      // keep the vault master password in the OS keychain; unlock at launch
	UpdateCheck   bool   `json:"updateCheck"`   // ask GitHub for the latest release at launch (opt-in)
}

const settingsVersion = 1

func defaults() Settings {
	return Settings{Version: settingsVersion, FontFamily: "JetBrains Mono, Menlo, monospace", FontSize: 13, Theme: "Spean Dark",
		Scrollback: 5000, CursorStyle: "block", CursorBlink: true, Bell: true, KeepaliveSec: 30, ConfirmClose: true, Concurrency: 2, AutoReconnect: true}
}

var (
	settingsMu   sync.Mutex
	settings     *Settings
	settingsPath = func() string {
		dir, _ := os.UserConfigDir()
		return filepath.Join(dir, "spean", "settings.json")
	}
)

// LoadSettings returns settings.json merged over defaults (missing keys keep their default).
func LoadSettings() Settings {
	settingsMu.Lock()
	defer settingsMu.Unlock()
	if settings != nil {
		return *settings
	}
	s := defaults()
	if b, err := os.ReadFile(settingsPath()); err == nil {
		json.Unmarshal(b, &s)
		if s.Version > settingsVersion { // newer Spean wrote this; keep defaults in memory, never overwrite
			d := defaults()
			d.Version = s.Version
			s = d
		}
	}
	settings = &s
	return s
}

func SaveSettings(s Settings) error {
	if s.Version > settingsVersion {
		return errors.New("settings.json was written by a newer Spean; not overwriting")
	}
	s.Version = settingsVersion
	if s.FontSize < 6 || s.KeepaliveSec < 5 || s.Concurrency < 1 {
		return errors.New("font size ≥ 6, keepalive ≥ 5 s, concurrency ≥ 1")
	}
	b, _ := json.MarshalIndent(s, "", "  ")
	os.MkdirAll(filepath.Dir(settingsPath()), 0700)
	if err := os.WriteFile(settingsPath(), b, 0600); err != nil {
		return err
	}
	settingsMu.Lock()
	settings = &s
	settingsMu.Unlock()
	return nil
}
