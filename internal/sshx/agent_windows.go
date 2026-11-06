package sshx

import (
	"net"
	"os"

	"github.com/Microsoft/go-winio"
)

// Windows OpenSSH agent listens on a named pipe; SSH_AUTH_SOCK may name another pipe (e.g. 1Password).
func dialAgent() (net.Conn, error) {
	pipe := os.Getenv("SSH_AUTH_SOCK")
	if pipe == "" {
		pipe = `\\.\pipe\openssh-ssh-agent`
	}
	return winio.DialPipe(pipe, nil)
}
