// Package vault keeps per-host secrets and private keys in one encrypted file.
// Key: argon2id(master password, salt). Cipher: XChaCha20-Poly1305 over the JSON body.
// The derived key lives in memory only, between Unlock and Lock. Nothing decrypted touches disk.
//
// ponytail: one encrypted JSON file instead of bbolt. A few hundred records, one writer,
// no partial updates needed. Swap to bbolt if per-record writes ever matter.
package vault

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"

	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/chacha20poly1305"
)

// Secret is what the vault remembers for one host alias.
type Secret struct {
	Password   string `json:"password,omitempty"`
	Passphrase string `json:"passphrase,omitempty"` // for the host's identity file
}

type body struct {
	Hosts map[string]Secret `json:"hosts"`
	Keys  map[string]string `json:"keys"` // name → private key PEM
}

type file struct {
	Version int    `json:"version"`
	Salt    []byte `json:"salt"`
	Time    uint32 `json:"time"`
	Memory  uint32 `json:"memory"`
	Threads uint8  `json:"threads"`
	Nonce   []byte `json:"nonce"`
	Data    []byte `json:"data"`
}

const version = 1

var (
	ErrLocked = errors.New("vault is locked")
	ErrNone   = errors.New("no vault")
	ErrBadPw  = errors.New("wrong master password")
)

type Vault struct {
	mu   sync.Mutex
	path string
	key  []byte // nil = locked
	body body
	meta file // kdf params + salt, kept so Save re-encrypts under the same key
}

func New(path string) *Vault { return &Vault{path: path} }

func DefaultPath() string {
	dir, _ := os.UserConfigDir()
	return filepath.Join(dir, "spean", "vault.json")
}

func (v *Vault) Exists() bool { _, err := os.Stat(v.path); return err == nil }

func (v *Vault) Locked() bool { v.mu.Lock(); defer v.mu.Unlock(); return v.key == nil }

// Create makes a new empty vault. Fails if one exists.
func (v *Vault) Create(master string) error {
	if v.Exists() {
		return errors.New("vault already exists")
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	v.meta = file{Version: version, Salt: make([]byte, 16), Time: 3, Memory: 64 * 1024, Threads: 4}
	rand.Read(v.meta.Salt)
	v.key = argon2.IDKey([]byte(master), v.meta.Salt, v.meta.Time, v.meta.Memory, v.meta.Threads, chacha20poly1305.KeySize)
	v.body = body{Hosts: map[string]Secret{}, Keys: map[string]string{}}
	return v.save()
}

// Unlock derives the key and decrypts. Machine-independent: copy the file, same password works.
func (v *Vault) Unlock(master string) error {
	b, err := os.ReadFile(v.path)
	if err != nil {
		return ErrNone
	}
	var f file
	if err := json.Unmarshal(b, &f); err != nil {
		return err
	}
	if f.Version > version {
		return errors.New("vault.json is from a newer Spean")
	}
	key := argon2.IDKey([]byte(master), f.Salt, f.Time, f.Memory, f.Threads, chacha20poly1305.KeySize)
	aead, _ := chacha20poly1305.NewX(key)
	plain, err := aead.Open(nil, f.Nonce, f.Data, nil)
	if err != nil {
		return ErrBadPw
	}
	var bd body
	if err := json.Unmarshal(plain, &bd); err != nil {
		return err
	}
	if bd.Hosts == nil {
		bd.Hosts = map[string]Secret{}
	}
	if bd.Keys == nil {
		bd.Keys = map[string]string{}
	}
	v.mu.Lock()
	v.key, v.body, v.meta = key, bd, f
	v.mu.Unlock()
	return nil
}

// Lock forgets the key and the decrypted body.
func (v *Vault) Lock() {
	v.mu.Lock()
	defer v.mu.Unlock()
	for i := range v.key {
		v.key[i] = 0
	}
	v.key, v.body = nil, body{}
}

// save encrypts under the current key with a fresh nonce; caller holds mu.
func (v *Vault) save() error {
	if v.key == nil {
		return ErrLocked
	}
	plain, _ := json.Marshal(v.body)
	aead, _ := chacha20poly1305.NewX(v.key)
	f := v.meta
	f.Nonce = make([]byte, chacha20poly1305.NonceSizeX)
	rand.Read(f.Nonce)
	f.Data = aead.Seal(nil, f.Nonce, plain, nil)
	out, _ := json.MarshalIndent(f, "", "  ")
	os.MkdirAll(filepath.Dir(v.path), 0700)
	tmp := v.path + ".tmp"
	if err := os.WriteFile(tmp, out, 0600); err != nil {
		return err
	}
	return os.Rename(tmp, v.path)
}

func (v *Vault) Host(alias string) (Secret, bool) {
	v.mu.Lock()
	defer v.mu.Unlock()
	if v.key == nil {
		return Secret{}, false
	}
	s, ok := v.body.Hosts[alias]
	return s, ok
}

// SetHost merges non-empty fields into the alias's secret.
func (v *Vault) SetHost(alias string, s Secret) error {
	v.mu.Lock()
	defer v.mu.Unlock()
	if v.key == nil {
		return ErrLocked
	}
	cur := v.body.Hosts[alias]
	if s.Password != "" {
		cur.Password = s.Password
	}
	if s.Passphrase != "" {
		cur.Passphrase = s.Passphrase
	}
	v.body.Hosts[alias] = cur
	return v.save()
}

func (v *Vault) DeleteHost(alias string) error {
	v.mu.Lock()
	defer v.mu.Unlock()
	if v.key == nil {
		return ErrLocked
	}
	delete(v.body.Hosts, alias)
	return v.save()
}

func (v *Vault) Hosts() []string {
	v.mu.Lock()
	defer v.mu.Unlock()
	out := make([]string, 0, len(v.body.Hosts))
	for a := range v.body.Hosts {
		out = append(out, a)
	}
	return out
}

func (v *Vault) Key(name string) (string, bool) {
	v.mu.Lock()
	defer v.mu.Unlock()
	if v.key == nil {
		return "", false
	}
	k, ok := v.body.Keys[name]
	return k, ok
}

func (v *Vault) SetKey(name, pem string) error {
	v.mu.Lock()
	defer v.mu.Unlock()
	if v.key == nil {
		return ErrLocked
	}
	v.body.Keys[name] = pem
	return v.save()
}

func (v *Vault) DeleteKey(name string) error {
	v.mu.Lock()
	defer v.mu.Unlock()
	if v.key == nil {
		return ErrLocked
	}
	delete(v.body.Keys, name)
	return v.save()
}

func (v *Vault) KeyNames() []string {
	v.mu.Lock()
	defer v.mu.Unlock()
	out := make([]string, 0, len(v.body.Keys))
	for n := range v.body.Keys {
		out = append(out, n)
	}
	return out
}

// Export returns the encrypted file bytes (opaque blob for backups).
func (v *Vault) Export() ([]byte, error) { return os.ReadFile(v.path) }
