package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"io"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"
)

// sshServer answers exec requests the way sshd does: $SHELL -c <command>, with no PTY.
func sshServer(t *testing.T, shell, home string) *ssh.Client {
	t.Helper()
	_, priv, _ := ed25519.GenerateKey(rand.Reader)
	signer, err := ssh.NewSignerFromKey(priv)
	if err != nil {
		t.Fatal(err)
	}
	conf := &ssh.ServerConfig{NoClientAuth: true}
	conf.AddHostKey(signer)
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
			go serveExec(nc, conf, shell, home)
		}
	}()
	client, err := ssh.Dial("tcp", l.Addr().String(), &ssh.ClientConfig{HostKeyCallback: ssh.FixedHostKey(signer.PublicKey())})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { client.Close() })
	return client
}

func serveExec(nc net.Conn, conf *ssh.ServerConfig, shell, home string) {
	_, chans, reqs, err := ssh.NewServerConn(nc, conf)
	if err != nil {
		return
	}
	go ssh.DiscardRequests(reqs)
	for nch := range chans {
		ch, chReqs, err := nch.Accept()
		if err != nil {
			return
		}
		go func() {
			for req := range chReqs {
				if req.Type != "exec" {
					req.Reply(false, nil)
					continue
				}
				var p struct{ Command string }
				ssh.Unmarshal(req.Payload, &p)
				req.Reply(true, nil)
				cmd := exec.Command(shell, "-c", p.Command)
				cmd.Dir = home
				cmd.Env = []string{"HOME=" + home, "SHELL=" + shell, "PATH=" + os.Getenv("PATH")}
				cmd.Stdout, cmd.Stderr = ch, ch.Stderr()
				stdin, _ := cmd.StdinPipe()
				go func() { io.Copy(stdin, ch); stdin.Close() }()
				code := uint32(0)
				if err := cmd.Run(); err != nil {
					code = 1
					if ee, ok := err.(*exec.ExitError); ok {
						code = uint32(ee.ExitCode())
					}
				}
				ch.SendRequest("exit-status", false, ssh.Marshal(struct{ Code uint32 }{code}))
				ch.Close()
			}
		}()
	}
}

func TestStepShell(t *testing.T) {
	for _, shell := range []string{"/bin/bash", "/bin/zsh", "/bin/sh"} {
		if _, err := os.Stat(shell); err != nil {
			continue
		}
		t.Run(filepath.Base(shell), func(t *testing.T) {
			home := t.TempDir()
			for _, f := range []string{".bash_profile", ".zprofile", ".profile"} {
				os.WriteFile(filepath.Join(home, f), []byte("echo PROFILE_NOISE\nexport FROM_LOGIN=yes\n"), 0o644)
			}
			s, err := newStepShell(sshServer(t, shell, home))
			if err != nil {
				t.Fatal(err)
			}
			defer s.sess.Close()

			run := func(cmd string) *ExecResult {
				t.Helper()
				type res struct {
					r   *ExecResult
					err error
				}
				done := make(chan res, 1)
				go func() {
					r, err := s.run(cmd, func(string) {})
					done <- res{r, err}
				}()
				select {
				case d := <-done:
					if d.err != nil {
						t.Fatalf("%q: %v", cmd, d.err)
					}
					return d.r
				case <-time.After(10 * time.Second):
					t.Fatalf("%q: hung", cmd)
					return nil
				}
			}
			expect := func(cmd, out string, exit int) {
				t.Helper()
				r := run(cmd)
				if strings.TrimSpace(r.Stdout) != out || r.Exit != exit {
					t.Errorf("%q: got exit %d output %q, want exit %d output %q", cmd, r.Exit, r.Stdout, exit, out)
				}
			}

			expect("echo hi", "hi", 0) // and no PROFILE_NOISE
			expect("echo $FROM_LOGIN", "yes", 0)
			expect("echo oops >&2", "oops", 0)
			expect("false", "", 1)
			expect("(exit 42)", "", 42)
			expect(`echo "it's"`, "it's", 0)

			// state carries between steps
			os.Mkdir(filepath.Join(home, "app"), 0o755)
			expect("cd app", "", 0)
			expect("basename \"$PWD\"", "app", 0)
			expect("export X=1", "", 0)
			expect("echo $X", "1", 0)

			// must return, not wait on the shell's stdin or swallow the next command
			expect("cat", "", 0)
			expect("echo still here", "still here", 0)

			if r := run(`echo "unbalanced`); r.Exit == 0 {
				t.Errorf("unbalanced quote: want non-zero exit, got output %q", r.Stdout)
			}
			if r, err := s.run("echo after", func(string) {}); err == nil && strings.TrimSpace(r.Stdout) != "after" {
				t.Errorf("after unbalanced quote: %q", r.Stdout)
			}

			// nothing writes a history file in the user's home
			for _, f := range []string{".bash_history", ".zsh_history", ".sh_history", ".history"} {
				if _, err := os.Stat(filepath.Join(home, f)); err == nil {
					t.Errorf("%s was written", f)
				}
			}
		})
	}
}

func TestStepShellExit(t *testing.T) {
	s, err := newStepShell(sshServer(t, "/bin/sh", t.TempDir()))
	if err != nil {
		t.Fatal(err)
	}
	defer s.sess.Close()
	var lines []string
	r, err := s.run("echo bye; exit 3", func(l string) { lines = append(lines, l) })
	if err != nil {
		t.Fatal(err)
	}
	if r.Exit != 3 || !strings.Contains(r.Stdout, "bye") || len(lines) != 1 {
		t.Errorf("got exit %d output %q lines %q", r.Exit, r.Stdout, lines)
	}
	if _, err := s.run("echo more", func(string) {}); err == nil {
		t.Error("want an error once the shell has ended")
	}
}

func TestStepShellStop(t *testing.T) {
	s, err := newStepShell(sshServer(t, "/bin/sh", t.TempDir()))
	if err != nil {
		t.Fatal(err)
	}
	errc := make(chan error, 1)
	go func() {
		_, err := s.run("sleep 30", func(string) {})
		errc <- err
	}()
	time.Sleep(200 * time.Millisecond)
	s.sess.Close()
	select {
	case err := <-errc:
		if err == nil {
			t.Error("want an error from a stopped run")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("run did not return after stop")
	}
}
