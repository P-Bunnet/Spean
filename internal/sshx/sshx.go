// Package sshx dials SSH hosts through an arbitrary chain of jump hosts.
package sshx

import (
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/skeema/knownhosts"
	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"

	"spean/internal/config"
	"spean/internal/vault"
)

// Prompter asks the user something and blocks until answered. alias lets the UI offer "remember in vault".
type Prompter interface {
	Ask(kind, alias, msg string, secret bool) (string, error)
}

// Secrets is the unlocked vault, or nil. Checked before every prompt; never written here.
var Secrets *vault.Vault

func secret(alias string) vault.Secret {
	if Secrets == nil {
		return vault.Secret{}
	}
	s, _ := Secrets.Host(alias)
	return s
}

// Chain holds every client in a hop chain so it can be closed in order.
type Chain struct {
	clients []*ssh.Client
	keys    []string // pool key per client
	Reused  int      // hops that reused a pooled login
}

// Client returns the client connected to the final target.
func (c *Chain) Client() *ssh.Client { return c.clients[len(c.clients)-1] }

// Close releases every hop, innermost first; shared clients stay up for other chains.
func (c *Chain) Close() {
	for i := len(c.clients) - 1; i >= 0; i-- {
		clients.release(c.keys[i], c.clients[i])
	}
}

// DialChain connects through hops to target. progress is called per hop with
// status "connecting", "ok" or "error".
func DialChain(hops []config.Hop, target config.Hop, p Prompter, progress func(alias, status string, err error)) (*Chain, error) {
	chain := &Chain{}
	all := append(append([]config.Hop{}, hops...), target)
	key := ""
	for i, hop := range all {
		progress(hop.Alias, "connecting", nil)
		key += hop.User + "@" + hop.Addr + ">"
		if c := clients.get(key); c != nil { // same login already open: reuse it, no auth, no prompts
			chain.clients = append(chain.clients, c)
			chain.keys = append(chain.keys, key)
			chain.Reused++
			progress(hop.Alias, "ok", nil)
			continue
		}
		cfg, err := clientConfig(hop, p)
		if err == nil {
			var client *ssh.Client
			if i == 0 {
				client, err = ssh.Dial("tcp", hop.Addr, cfg)
			} else {
				var nc net.Conn
				nc, err = chain.Client().Dial("tcp", hop.Addr)
				if err == nil {
					var c ssh.Conn
					var chans <-chan ssh.NewChannel
					var reqs <-chan *ssh.Request
					c, chans, reqs, err = ssh.NewClientConn(nc, hop.Addr, cfg)
					if err == nil {
						client = ssh.NewClient(c, chans, reqs)
					}
				}
			}
			if err == nil {
				clients.put(key, client)
				chain.clients = append(chain.clients, client)
				chain.keys = append(chain.keys, key)
			}
		}
		if err != nil {
			err = fmt.Errorf("hop %d (%s): %w", i+1, hop.Addr, err)
			progress(hop.Alias, "error", err)
			chain.Close()
			return nil, err
		}
		progress(hop.Alias, "ok", nil)
	}
	if target.ForwardAgent {
		if ag := agentClient(); ag != nil {
			agent.ForwardToAgent(chain.Client(), ag)
		}
	}
	return chain, nil
}

func agentClient() agent.ExtendedAgent {
	conn, err := dialAgent()
	if err != nil {
		return nil
	}
	return agent.NewClient(conn)
}

func clientConfig(hop config.Hop, p Prompter) (*ssh.ClientConfig, error) {
	khPath := filepath.Join(sshDir(), "known_hosts")
	if _, err := os.Stat(khPath); os.IsNotExist(err) {
		os.WriteFile(khPath, nil, 0600)
	}
	kh, err := knownhosts.NewDB(khPath)
	if err != nil {
		return nil, fmt.Errorf("known_hosts: %w", err)
	}
	verify := kh.HostKeyCallback()
	return &ssh.ClientConfig{
		User:              hop.User,
		Auth:              authMethods(hop, p),
		HostKeyAlgorithms: kh.HostKeyAlgorithms(hop.Addr),
		Timeout:           15 * time.Second,
		HostKeyCallback: func(hostname string, remote net.Addr, key ssh.PublicKey) error {
			err := verify(hostname, remote, key)
			if err == nil || !knownhosts.IsHostUnknown(err) {
				return err // mismatch is fatal, never bypass
			}
			ans, perr := p.Ask("hostkey", hop.Alias, fmt.Sprintf(
				"%s is not in known_hosts.\n%s key fingerprint: %s\nTrust this host?",
				hostname, key.Type(), ssh.FingerprintSHA256(key)), false)
			if perr != nil || ans != "yes" {
				return fmt.Errorf("host key for %s rejected", hostname)
			}
			f, err := os.OpenFile(khPath, os.O_APPEND|os.O_WRONLY, 0600)
			if err != nil {
				return err
			}
			defer f.Close()
			return knownhosts.WriteKnownHost(f, hostname, remote, key)
		},
	}, nil
}

// authMethods: ssh-agent first, then identity files (vault passphrase before prompting),
// then vault password, then password / keyboard-interactive prompts.
func authMethods(hop config.Hop, p Prompter) []ssh.AuthMethod {
	var methods []ssh.AuthMethod
	if ag := agentClient(); ag != nil {
		if hop.ExplicitKey { // only offer the agent key that matches the configured identity; servers cap attempts at ~6
			methods = append(methods, ssh.PublicKeysCallback(func() ([]ssh.Signer, error) { return matchingSigners(ag, hop.IdentityFiles) }))
		} else {
			methods = append(methods, ssh.PublicKeysCallback(ag.Signers))
		}
	}
	methods = append(methods, ssh.PublicKeysCallback(func() ([]ssh.Signer, error) {
		var signers []ssh.Signer
		for _, path := range hop.IdentityFiles {
			var pem []byte
			if name, ok := strings.CutPrefix(path, "vault:"); ok { // key stored in the vault
				if Secrets == nil {
					continue
				}
				k, ok := Secrets.Key(name)
				if !ok {
					continue
				}
				pem = []byte(k)
			} else {
				var err error
				if pem, err = os.ReadFile(path); err != nil {
					continue
				}
			}
			s, err := ssh.ParsePrivateKey(pem)
			var missing *ssh.PassphraseMissingError
			if errors.As(err, &missing) {
				if pp := secret(hop.Alias).Passphrase; pp != "" {
					s, err = ssh.ParsePrivateKeyWithPassphrase(pem, []byte(pp))
				}
				if err != nil {
					pass, perr := p.Ask("passphrase", hop.Alias, "Passphrase for "+path+":", true)
					if perr != nil {
						continue
					}
					s, err = ssh.ParsePrivateKeyWithPassphrase(pem, []byte(pass))
				}
			}
			if err == nil {
				signers = append(signers, s) // decrypted key lives in memory only
			}
		}
		return signers, nil
	}))
	if pw := secret(hop.Alias).Password; pw != "" {
		methods = append(methods, ssh.Password(pw))
	}
	askPass := func() (string, error) {
		return p.Ask("password", hop.Alias, fmt.Sprintf("Password for %s@%s:", hop.User, hop.Addr), true)
	}
	methods = append(methods,
		ssh.RetryableAuthMethod(ssh.PasswordCallback(askPass), 3),
		ssh.RetryableAuthMethod(ssh.KeyboardInteractive(func(_, _ string, questions []string, _ []bool) ([]string, error) {
			answers := make([]string, len(questions))
			for i, q := range questions {
				a, err := p.Ask("password", hop.Alias, fmt.Sprintf("%s@%s\n%s", hop.User, hop.Addr, q), true)
				if err != nil {
					return nil, err
				}
				answers[i] = a
			}
			return answers, nil
		}), 3),
	)
	return methods
}

func sshDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".ssh")
}

// matchingSigners keeps agent keys whose public part equals one of the identity files' public keys.
// Falls back to every agent key when nothing matches (the file may live only in the agent).
func matchingSigners(ag agent.ExtendedAgent, files []string) ([]ssh.Signer, error) {
	all, err := ag.Signers()
	if err != nil {
		return nil, err
	}
	want := map[string]bool{}
	for _, f := range files {
		if pub := publicKeyOf(f); pub != nil {
			want[string(pub.Marshal())] = true
		}
	}
	var out []ssh.Signer
	for _, s := range all {
		if want[string(s.PublicKey().Marshal())] {
			out = append(out, s)
		}
	}
	if len(out) == 0 {
		return all, nil
	}
	return out, nil
}

// publicKeyOf reads path.pub, or the public half embedded in an (even encrypted) private key.
func publicKeyOf(path string) ssh.PublicKey {
	if b, err := os.ReadFile(path + ".pub"); err == nil {
		if pub, _, _, _, err := ssh.ParseAuthorizedKey(b); err == nil {
			return pub
		}
	}
	pem, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	s, err := ssh.ParsePrivateKey(pem)
	if err == nil {
		return s.PublicKey()
	}
	var missing *ssh.PassphraseMissingError
	if errors.As(err, &missing) && missing.PublicKey != nil {
		return missing.PublicKey
	}
	return nil
}
