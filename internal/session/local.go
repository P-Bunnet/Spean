package session

import (
	"os"
	"os/exec"

	"github.com/creack/pty"
)

// Local runs the user's $SHELL in a PTY on this machine; same surface as Session.
type Local struct {
	cmd *exec.Cmd
	f   *os.File
}

func StartLocal(cols, rows int, onData func([]byte), onExit func(error)) (*Local, error) {
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/sh"
	}
	cmd := exec.Command(shell, "-l")
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")
	f, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)})
	if err != nil {
		return nil, err
	}
	go func() {
		buf := make([]byte, 32*1024)
		for {
			n, err := f.Read(buf)
			if n > 0 {
				out := make([]byte, n)
				copy(out, buf[:n])
				onData(out)
			}
			if err != nil {
				break
			}
		}
		onExit(cmd.Wait())
	}()
	return &Local{cmd: cmd, f: f}, nil
}

func (l *Local) Write(b []byte) { l.f.Write(b) }

func (l *Local) Resize(cols, rows int) {
	pty.Setsize(l.f, &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)})
}

func (l *Local) Close() {
	if l.cmd.Process != nil {
		l.cmd.Process.Kill()
	}
	l.f.Close()
}
