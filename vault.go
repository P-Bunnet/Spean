package main

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/zalando/go-keyring"
	"golang.org/x/crypto/ssh"

	"spean/internal/config"
	"spean/internal/sshx"
	"spean/internal/vault"
)

// ---- vault -----------------------------------------------------------------

type VaultStatus struct {
	Exists bool `json:"exists"`
	Locked bool `json:"locked"`
}

func (a *App) VaultStatus() VaultStatus {
	return VaultStatus{Exists: a.vault.Exists(), Locked: a.vault.Locked()}
}

func (a *App) VaultCreate(master string) error {
	if len(master) < 8 {
		return errors.New("master password: 8 characters or more")
	}
	if err := a.vault.Create(master); err != nil {
		return err
	}
	sshx.Secrets = a.vault
	return nil
}

func (a *App) VaultUnlock(master string) error {
	if err := a.vault.Unlock(master); err != nil {
		return err
	}
	sshx.Secrets = a.vault
	if config.LoadSettings().Keychain {
		keyring.Set(keyringService, keyringUser, master) // best effort; the setting is opt-in
	}
	return nil
}

const keyringService, keyringUser = "spean", "vault"

// VaultAutoUnlock tries the keychain-held master password (setting on). Returns whether the vault is open.
func (a *App) VaultAutoUnlock() bool {
	if !config.LoadSettings().Keychain || !a.vault.Exists() {
		return false
	}
	pw, err := keyring.Get(keyringService, keyringUser)
	if err != nil || a.vault.Unlock(pw) != nil {
		return false
	}
	sshx.Secrets = a.vault
	return true
}

// VaultForgetKeychain removes the stored master password (setting turned off).
func (a *App) VaultForgetKeychain() { keyring.Delete(keyringService, keyringUser) }

// VaultLock drops the key; open sessions keep running.
func (a *App) VaultLock() {
	sshx.Secrets = nil
	a.vault.Lock()
}

// VaultRemember stores a prompt answer: kind is "password" or "passphrase".
func (a *App) VaultRemember(alias, kind, value string) error {
	s := vault.Secret{}
	if kind == "password" {
		s.Password = value
	} else {
		s.Passphrase = value
	}
	return a.vault.SetHost(alias, s)
}

func (a *App) VaultForget(alias string) error { return a.vault.DeleteHost(alias) }

func (a *App) VaultHosts() []string { return a.vault.Hosts() }

// ---- keys ------------------------------------------------------------------

type KeyInfo struct {
	Name        string `json:"name"`
	Ref         string `json:"ref"` // what goes in SavedHost.Key: a path, or vault:<name>
	Type        string `json:"type"`
	Fingerprint string `json:"fingerprint"`
	Public      string `json:"public"` // authorized_keys line
	Encrypted   bool   `json:"encrypted"`
	Source      string `json:"source"` // ssh | vault
}

// ListKeys scans ~/.ssh (private files that parse, public part shown) and the vault.
func (a *App) ListKeys() []KeyInfo {
	var out []KeyInfo
	home, _ := os.UserHomeDir()
	dir := filepath.Join(home, ".ssh")
	ents, _ := os.ReadDir(dir)
	for _, e := range ents {
		name := e.Name()
		if e.IsDir() || strings.HasSuffix(name, ".pub") || name == "config" || name == "known_hosts" || name == "authorized_keys" {
			continue
		}
		p := filepath.Join(dir, name)
		pem, err := os.ReadFile(p)
		if err != nil || !bytes.Contains(pem, []byte("PRIVATE KEY")) {
			continue
		}
		k := KeyInfo{Name: name, Ref: p, Source: "ssh"}
		fillKey(&k, pem, p+".pub")
		out = append(out, k)
	}
	for _, name := range a.vault.KeyNames() {
		pem, _ := a.vault.Key(name)
		k := KeyInfo{Name: name, Ref: "vault:" + name, Source: "vault"}
		fillKey(&k, []byte(pem), "")
		out = append(out, k)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

func fillKey(k *KeyInfo, pem []byte, pubPath string) {
	var pub ssh.PublicKey
	if s, err := ssh.ParsePrivateKey(pem); err == nil {
		pub = s.PublicKey()
	} else {
		var missing *ssh.PassphraseMissingError
		k.Encrypted = errors.As(err, &missing)
		if missing != nil && missing.PublicKey != nil {
			pub = missing.PublicKey // openssh format carries the public key in the clear
		} else if b, err := os.ReadFile(pubPath); err == nil {
			pub, _, _, _, _ = ssh.ParseAuthorizedKey(b)
		}
	}
	if pub != nil {
		k.Type = pub.Type()
		k.Fingerprint = ssh.FingerprintSHA256(pub)
		k.Public = strings.TrimSpace(string(ssh.MarshalAuthorizedKey(pub))) + " " + k.Name
	}
}

// GenerateKey makes an ed25519 key. toVault stores the PEM in the vault; otherwise ~/.ssh/<name> (+ .pub).
func (a *App) GenerateKey(name, passphrase string, toVault bool) (*KeyInfo, error) {
	name = strings.TrimSpace(name)
	if name == "" || strings.ContainsAny(name, "/ ") {
		return nil, errors.New("key name: letters, digits, - and _")
	}
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}
	var block *pem.Block
	if passphrase != "" {
		block, err = ssh.MarshalPrivateKeyWithPassphrase(priv, "spean:"+name, []byte(passphrase))
	} else {
		block, err = ssh.MarshalPrivateKey(priv, "spean:"+name)
	}
	if err != nil {
		return nil, err
	}
	pemBytes := pem.EncodeToMemory(block)
	k := KeyInfo{Name: name, Encrypted: passphrase != ""}
	if toVault {
		if err := a.vault.SetKey(name, string(pemBytes)); err != nil {
			return nil, err
		}
		k.Ref, k.Source = "vault:"+name, "vault"
		fillKey(&k, pemBytes, "")
		return &k, nil
	}
	home, _ := os.UserHomeDir()
	p := filepath.Join(home, ".ssh", name)
	if _, err := os.Stat(p); err == nil {
		return nil, fmt.Errorf("%s exists", p)
	}
	os.MkdirAll(filepath.Dir(p), 0700)
	if err := os.WriteFile(p, pemBytes, 0600); err != nil {
		return nil, err
	}
	k.Ref, k.Source = p, "ssh"
	fillKey(&k, pemBytes, "")
	os.WriteFile(p+".pub", []byte(k.Public+"\n"), 0644)
	return &k, nil
}

// InstallKey appends an authorized_keys line on the tab's host over SFTP (ssh-copy-id without a shell).
func (a *App) InstallKey(id, public string) error {
	c, err := a.sftpClient(id)
	if err != nil {
		return err
	}
	home, err := c.Getwd()
	if err != nil {
		return err
	}
	dir := home + "/.ssh"
	c.MkdirAll(dir)
	c.Chmod(dir, 0700)
	ak := dir + "/authorized_keys"
	var cur []byte
	if f, err := c.Open(ak); err == nil {
		cur, _ = io.ReadAll(f)
		f.Close()
	}
	public = strings.TrimSpace(public)
	for _, line := range strings.Split(string(cur), "\n") {
		if fields := strings.Fields(line); len(fields) >= 2 && len(strings.Fields(public)) >= 2 && fields[1] == strings.Fields(public)[1] {
			return nil // already there
		}
	}
	if len(cur) > 0 && !bytes.HasSuffix(cur, []byte("\n")) {
		cur = append(cur, '\n')
	}
	f, err := c.OpenFile(ak, os.O_WRONLY|os.O_CREATE|os.O_TRUNC)
	if err != nil {
		return err
	}
	_, err = f.Write(append(cur, []byte(public+"\n")...))
	f.Close()
	c.Chmod(ak, 0600)
	return err
}

// ImportHost copies a ~/.ssh/config alias into a Spean saved host (the config file is untouched).
func (a *App) ImportHost(alias string) error {
	_, h, err := config.Resolve(alias)
	if err != nil {
		return err
	}
	host, port := h.Addr, "22"
	if i := strings.LastIndex(h.Addr, ":"); i > 0 {
		host, port = h.Addr[:i], h.Addr[i+1:]
	}
	key := ""
	if len(h.IdentityFiles) > 0 && !strings.HasSuffix(h.IdentityFiles[0], "/.ssh/id_ed25519") {
		key = h.IdentityFiles[0]
	}
	return config.SaveHost(config.SavedHost{Label: alias, Address: host, Port: port, User: h.User, Key: key,
		Jump: config.Get(alias, "ProxyJump"), ForwardAgent: h.ForwardAgent, Group: "imported"})
}
