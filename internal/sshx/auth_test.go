//go:build !windows

package sshx

import (
	"crypto/ed25519"
	"crypto/rand"
	"errors"
	"net"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"

	"spean/internal/config"
)

type stubPrompter struct {
	mu       sync.Mutex
	password string
	asked    int
}

func (p *stubPrompter) Ask(kind, _, _ string, _ bool) (string, error) {
	if kind == "hostkey" {
		return "yes", nil
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	p.asked++
	return p.password, nil
}

// passwordServer accepts only this password, or only the accepted key when one is given.
// Its MaxAuthTries is the default 6, like sshd.
func passwordServer(t *testing.T, password string, accepted ssh.PublicKey) string {
	t.Helper()
	_, hostPriv, _ := ed25519.GenerateKey(rand.Reader)
	hostKey, err := ssh.NewSignerFromKey(hostPriv)
	if err != nil {
		t.Fatal(err)
	}
	conf := &ssh.ServerConfig{
		PasswordCallback: func(_ ssh.ConnMetadata, pw []byte) (*ssh.Permissions, error) {
			if string(pw) == password {
				return nil, nil
			}
			return nil, errors.New("wrong password")
		},
		PublicKeyCallback: func(_ ssh.ConnMetadata, key ssh.PublicKey) (*ssh.Permissions, error) {
			if accepted != nil && string(key.Marshal()) == string(accepted.Marshal()) {
				return nil, nil
			}
			return nil, errors.New("key not accepted")
		},
	}
	conf.AddHostKey(hostKey)
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { l.Close() })
	go func() {
		for {
			nc, err := l.Accept()
			if err != nil {
				return
			}
			go func() {
				c, chans, reqs, err := ssh.NewServerConn(nc, conf)
				if err != nil {
					return
				}
				defer c.Close()
				go ssh.DiscardRequests(reqs)
				for ch := range chans {
					ch.Reject(ssh.Prohibited, "no channels here")
				}
			}()
		}
	}()
	return l.Addr().String()
}

// agentWithKeys serves n fresh keys on a unix socket and points SSH_AUTH_SOCK at it.
func agentWithKeys(t *testing.T, n int) []ssh.PublicKey {
	t.Helper()
	keyring := agent.NewKeyring()
	var pubs []ssh.PublicKey
	for range n {
		pub, priv, _ := ed25519.GenerateKey(rand.Reader)
		if err := keyring.Add(agent.AddedKey{PrivateKey: priv}); err != nil {
			t.Fatal(err)
		}
		sshPub, _ := ssh.NewPublicKey(pub)
		pubs = append(pubs, sshPub)
	}
	dir, err := os.MkdirTemp("", "ag") // not t.TempDir: unix socket paths have a short limit
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })
	sock := filepath.Join(dir, "agent")
	l, err := net.Listen("unix", sock)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { l.Close() })
	go func() {
		for {
			c, err := l.Accept()
			if err != nil {
				return
			}
			go agent.ServeAgent(keyring, c)
		}
	}()
	t.Setenv("SSH_AUTH_SOCK", sock)
	return pubs
}

func TestAuth(t *testing.T) {
	dial := func(t *testing.T, addr string, p *stubPrompter) error {
		t.Helper()
		t.Setenv("HOME", t.TempDir())
		t.Setenv("USERPROFILE", t.TempDir())
		if err := os.MkdirAll(sshDir(), 0o700); err != nil {
			t.Fatal(err)
		}
		hop := config.Hop{Alias: "srv", User: "u", Addr: addr}
		chain, err := DialChain(nil, hop, p, func(string, string, error) {})
		if err == nil {
			chain.Close()
		}
		return err
	}

	t.Run("more agent keys than the server allows still reaches the password prompt", func(t *testing.T) {
		agentWithKeys(t, 8)
		p := &stubPrompter{password: "secret"}
		if err := dial(t, passwordServer(t, "secret", nil), p); err != nil {
			t.Fatalf("want a login with the password, got %v", err)
		}
		if p.asked != 1 {
			t.Errorf("password asked %d times, want 1", p.asked)
		}
	})

	t.Run("a key the server accepts needs no password", func(t *testing.T) {
		keys := agentWithKeys(t, 3)
		p := &stubPrompter{password: "secret"}
		if err := dial(t, passwordServer(t, "secret", keys[1]), p); err != nil {
			t.Fatal(err)
		}
		if p.asked != 0 {
			t.Errorf("password asked %d times, want 0", p.asked)
		}
	})

	t.Run("a wrong password ends in an error, not a loop", func(t *testing.T) {
		agentWithKeys(t, 8)
		p := &stubPrompter{password: "wrong"}
		if err := dial(t, passwordServer(t, "secret", nil), p); err == nil {
			t.Fatal("want an error")
		}
		if p.asked == 0 || p.asked > 6 {
			t.Errorf("password asked %d times", p.asked)
		}
	})
}
