// Package session runs an interactive shell with a PTY over an ssh.Client.
package session

import (
	"io"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"
)

type Session struct {
	sess  *ssh.Session
	stdin io.WriteCloser
}

// Options tweak the shell after login.
type Options struct {
	ForwardAgent bool   // requires agent.ForwardToAgent on the client first
	Snippet      string // typed into the shell once it starts
}

// Start opens a shell. onData receives PTY output; onExit fires once the shell ends.
func Start(client *ssh.Client, cols, rows int, opt Options, onData func([]byte), onExit func(error)) (*Session, error) {
	sess, err := client.NewSession()
	if err != nil {
		return nil, err
	}
	if opt.ForwardAgent {
		agent.RequestAgentForwarding(sess) // best effort; server may refuse
	}
	modes := ssh.TerminalModes{ssh.ECHO: 1, ssh.TTY_OP_ISPEED: 14400, ssh.TTY_OP_OSPEED: 14400}
	if err := sess.RequestPty("xterm-256color", rows, cols, modes); err != nil {
		sess.Close()
		return nil, err
	}
	stdin, err := sess.StdinPipe()
	if err != nil {
		sess.Close()
		return nil, err
	}
	w := writerFunc(onData)
	sess.Stdout, sess.Stderr = w, w
	if err := sess.Shell(); err != nil {
		sess.Close()
		return nil, err
	}
	go func() { onExit(sess.Wait()) }()
	if opt.Snippet != "" {
		stdin.Write([]byte(opt.Snippet + "\n"))
	}
	return &Session{sess: sess, stdin: stdin}, nil
}

func (s *Session) Write(b []byte) { s.stdin.Write(b) }

func (s *Session) Resize(cols, rows int) { s.sess.WindowChange(rows, cols) }

func (s *Session) Close() { s.sess.Close() }

type writerFunc func([]byte)

func (f writerFunc) Write(b []byte) (int, error) {
	out := make([]byte, len(b)) // ssh reuses its buffer; copy before handing off
	copy(out, b)
	f(out)
	return len(b), nil
}
