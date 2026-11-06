package sshx

import (
	"errors"
	"net"
	"strings"
	"testing"
)

func TestExplain(t *testing.T) {
	cases := []struct {
		err  error
		want string
	}{
		{&net.DNSError{Err: "no such host", Name: "bastion.example"}, "does not resolve"},
		{errors.New("dial tcp 10.0.0.5:22: connect: connection refused"), "Nothing is listening"},
		{errors.New("dial tcp 10.0.0.5:22: i/o timeout"), "No route"},
		{errors.New("ssh: handshake failed: ssh: unable to authenticate, attempted methods [none publickey password], no supported methods remain"), "refused every credential"},
		{errors.New("something else"), "something else"},
	}
	for _, c := range cases {
		if got := Explain(c.err, "10.0.0.5:22"); !strings.Contains(got, c.want) {
			t.Errorf("Explain(%v) = %q, want %q", c.err, got, c.want)
		}
	}
}
