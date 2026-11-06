//go:build !windows

package forward

import (
	"net"
	"os"
)

// listenLocal opens the Docker bridge endpoint: a unix socket at path.
func listenLocal(path string) (net.Listener, error) {
	os.Remove(path) // stale socket from a previous run
	return net.Listen("unix", path)
}
