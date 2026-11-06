// Package forward runs -L / -R / -D port forwards and a Docker-socket bridge over an ssh.Client.
package forward

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"strconv"
	"sync"
	"sync/atomic"

	"golang.org/x/crypto/ssh"
)

// Forward is one active listener. Emitted whole on every change.
type Forward struct {
	ID     string `json:"id"`
	TabID  string `json:"tabId"`
	Kind   string `json:"kind"`   // local | remote | dynamic | docker
	Listen string `json:"listen"` // local: 127.0.0.1:8080 · remote: 0.0.0.0:8080 (on the server) · dynamic: 127.0.0.1:1080 · docker: unix socket path
	Target string `json:"target"` // local/remote: host:port on the other side · docker: remote socket path
	Bytes  int64  `json:"bytes"`
	Err    string `json:"err,omitempty"`
	Active bool   `json:"active"`

	ln     net.Listener
	cancel context.CancelFunc
	bytes  atomic.Int64
}

type Manager struct {
	Emit   func(*Forward)
	mu     sync.Mutex
	fwds   map[string]*Forward
	nextID int
}

func New() *Manager { return &Manager{fwds: map[string]*Forward{}} }

func (m *Manager) List() []*Forward {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]*Forward, 0, len(m.fwds))
	for _, f := range m.fwds {
		f.Bytes = f.bytes.Load()
		out = append(out, f)
	}
	return out
}

// Start opens the listener and serves until Stop. dial is the ssh client for the tab.
func (m *Manager) Start(tabID, kind, listen, target string, client *ssh.Client) (*Forward, error) {
	var ln net.Listener
	var err error
	var connect func(net.Conn) (net.Conn, error)
	switch kind {
	case "local":
		ln, err = net.Listen("tcp", listen)
		connect = func(net.Conn) (net.Conn, error) { return client.Dial("tcp", target) }
	case "remote":
		ln, err = client.Listen("tcp", listen)
		connect = func(net.Conn) (net.Conn, error) { return net.Dial("tcp", target) }
	case "dynamic":
		ln, err = net.Listen("tcp", listen)
		connect = func(c net.Conn) (net.Conn, error) { return socks5(c, client) }
	case "docker":
		ln, err = listenLocal(listen)
		connect = func(net.Conn) (net.Conn, error) { return client.Dial("unix", target) }
	default:
		return nil, fmt.Errorf("unknown forward kind %q", kind)
	}
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	m.mu.Lock()
	m.nextID++
	f := &Forward{ID: strconv.Itoa(m.nextID), TabID: tabID, Kind: kind, Listen: listen, Target: target, Active: true, ln: ln, cancel: cancel}
	if kind != "docker" {
		f.Listen = ln.Addr().String() // resolves :0 to the real port
	}
	m.fwds[f.ID] = f
	m.mu.Unlock()
	m.Emit(f)
	go m.serve(ctx, f, connect)
	return f, nil
}

func (m *Manager) serve(ctx context.Context, f *Forward, connect func(net.Conn) (net.Conn, error)) {
	go func() { <-ctx.Done(); f.ln.Close() }()
	for {
		c, err := f.ln.Accept()
		if err != nil {
			if ctx.Err() == nil {
				f.Err = err.Error()
			}
			f.Active = false
			f.Bytes = f.bytes.Load()
			m.Emit(f)
			return
		}
		go func() {
			defer c.Close()
			r, err := connect(c)
			if err != nil {
				return
			}
			defer r.Close()
			done := make(chan struct{}, 2)
			pipe := func(dst io.Writer, src io.Reader) {
				n, _ := io.Copy(dst, src)
				f.bytes.Add(n)
				done <- struct{}{}
			}
			go pipe(r, c)
			go pipe(c, r)
			<-done
			f.Bytes = f.bytes.Load()
			m.Emit(f)
		}()
	}
}

func (m *Manager) Stop(id string) {
	m.mu.Lock()
	f := m.fwds[id]
	if f != nil {
		delete(m.fwds, id)
	}
	m.mu.Unlock()
	if f != nil {
		f.cancel()
		f.Active = false
		m.Emit(f)
	}
}

// StopTab stops every forward that belongs to a tab.
func (m *Manager) StopTab(tabID string) {
	for _, f := range m.List() {
		if f.TabID == tabID {
			m.Stop(f.ID)
		}
	}
}

// socks5 answers a SOCKS5 CONNECT on c (no auth) and returns the ssh-dialed connection.
// ponytail: CONNECT only; BIND and UDP ASSOCIATE are not needed for browser/curl use.
func socks5(c net.Conn, client *ssh.Client) (net.Conn, error) {
	var hdr [2]byte
	if _, err := io.ReadFull(c, hdr[:]); err != nil || hdr[0] != 5 {
		return nil, errors.New("not socks5")
	}
	methods := make([]byte, hdr[1])
	if _, err := io.ReadFull(c, methods); err != nil {
		return nil, err
	}
	c.Write([]byte{5, 0}) // no auth
	var req [4]byte
	if _, err := io.ReadFull(c, req[:]); err != nil || req[1] != 1 {
		c.Write([]byte{5, 7, 0, 1, 0, 0, 0, 0, 0, 0})
		return nil, errors.New("only CONNECT supported")
	}
	var host string
	switch req[3] {
	case 1:
		var a [4]byte
		io.ReadFull(c, a[:])
		host = net.IP(a[:]).String()
	case 3:
		var n [1]byte
		io.ReadFull(c, n[:])
		b := make([]byte, n[0])
		io.ReadFull(c, b)
		host = string(b)
	case 4:
		var a [16]byte
		io.ReadFull(c, a[:])
		host = net.IP(a[:]).String()
	default:
		return nil, errors.New("bad address type")
	}
	var p [2]byte
	if _, err := io.ReadFull(c, p[:]); err != nil {
		return nil, err
	}
	r, err := client.Dial("tcp", net.JoinHostPort(host, strconv.Itoa(int(binary.BigEndian.Uint16(p[:])))))
	if err != nil {
		c.Write([]byte{5, 5, 0, 1, 0, 0, 0, 0, 0, 0})
		return nil, err
	}
	c.Write([]byte{5, 0, 0, 1, 0, 0, 0, 0, 0, 0})
	return r, nil
}
