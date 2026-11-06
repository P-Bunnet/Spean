package forward

import (
	"net"

	"github.com/Microsoft/go-winio"
)

// listenLocal opens the Docker bridge endpoint: a named pipe (path is \\.\pipe\name).
func listenLocal(path string) (net.Listener, error) { return winio.ListenPipe(path, nil) }
