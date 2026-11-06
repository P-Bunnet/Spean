package sshx

import (
	"sync"

	"golang.org/x/crypto/ssh"
)

// pool shares one ssh.Client per (user, addr, route) across chains, refcounted, like ControlMaster.
// A second tab through the same bastion reuses the login instead of authenticating again.
// ponytail: keyed by the path so far, so "a→b" and "c→b" stay separate clients; fine for real setups.
type pool struct {
	mu sync.Mutex
	m  map[string]*shared
}

type shared struct {
	client *ssh.Client
	refs   int
}

var clients = &pool{m: map[string]*shared{}}

// get returns a live shared client for key, or nil. Dead clients are dropped on the spot.
func (p *pool) get(key string) *ssh.Client {
	p.mu.Lock()
	defer p.mu.Unlock()
	s := p.m[key]
	if s == nil {
		return nil
	}
	if _, _, err := s.client.SendRequest("keepalive@openssh.com", true, nil); err != nil {
		delete(p.m, key) // died while nobody was looking
		return nil
	}
	s.refs++
	return s.client
}

func (p *pool) put(key string, c *ssh.Client) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.m[key] = &shared{client: c, refs: 1}
}

// release drops one reference; the client closes when the last chain lets go.
func (p *pool) release(key string, c *ssh.Client) {
	p.mu.Lock()
	defer p.mu.Unlock()
	s := p.m[key]
	if s == nil || s.client != c { // not pooled (or replaced): close directly
		c.Close()
		return
	}
	s.refs--
	if s.refs <= 0 {
		delete(p.m, key)
		c.Close()
	}
}

// Shared reports how many chains currently reuse pooled clients (for the UI / debugging).
func Shared() int {
	clients.mu.Lock()
	defer clients.mu.Unlock()
	n := 0
	for _, s := range clients.m {
		if s.refs > 1 {
			n += s.refs - 1
		}
	}
	return n
}
