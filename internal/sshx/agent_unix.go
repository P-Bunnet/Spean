//go:build !windows

package sshx

import (
	"errors"
	"net"
	"os"
)

func dialAgent() (net.Conn, error) {
	sock := os.Getenv("SSH_AUTH_SOCK")
	if sock == "" {
		return nil, errors.New("no SSH_AUTH_SOCK")
	}
	return net.Dial("unix", sock)
}
