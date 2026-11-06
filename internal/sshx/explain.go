package sshx

import (
	"errors"
	"fmt"
	"net"
	"regexp"
	"strings"

	knownhosts "golang.org/x/crypto/ssh/knownhosts"
)

var authRe = regexp.MustCompile(`attempted methods \[([^\]]*)\], no supported methods remain`)

// Explain turns a dial/auth error into a sentence with a next step. addr is host:port of the hop.
func Explain(err error, addr string) string {
	if err == nil {
		return ""
	}
	host := addr
	if h, _, e := net.SplitHostPort(addr); e == nil {
		host = h
	}
	msg := err.Error()
	var dns *net.DNSError
	var ke *knownhosts.KeyError
	switch {
	case errors.As(err, &dns):
		return fmt.Sprintf("%s does not resolve. Check the hostname or your VPN.", host)
	case strings.Contains(msg, "connection refused"):
		return fmt.Sprintf("Nothing is listening on %s. Wrong port, or sshd is down.", addr)
	case strings.Contains(msg, "i/o timeout") || strings.Contains(msg, "deadline exceeded"):
		return fmt.Sprintf("No route to %s after 15 s. Firewall or VPN?", addr)
	case strings.Contains(msg, "no route to host") || strings.Contains(msg, "network is unreachable"):
		return fmt.Sprintf("No route to %s. Are you on the right network or VPN?", addr)
	case errors.As(err, &ke) && len(ke.Want) > 0:
		w := ke.Want[0]
		return fmt.Sprintf("Host key for %s changed. If you reinstalled the server, remove line %d of %s. If not, stop: someone may be intercepting.", host, w.Line, w.Filename)
	case strings.Contains(msg, "rejected"):
		return fmt.Sprintf("You rejected the host key for %s.", host)
	case authRe.MatchString(msg):
		m := authRe.FindStringSubmatch(msg)
		accepts := "nothing you offered"
		if strings.Contains(msg, "publickey") && !strings.Contains(m[1], "publickey") {
			accepts = "publickey"
		}
		return fmt.Sprintf("%s refused every credential (tried: %s; it accepts: %s). Install a key with Keys → Install on host, or check the username.", addr, strings.TrimSpace(m[1]), accepts)
	case strings.Contains(msg, "unable to authenticate"):
		return fmt.Sprintf("%s refused the agent keys, identity files and password. Check the username, or install a key with Keys → Install on host.", addr)
	case strings.Contains(msg, "prompt timed out"):
		return "No answer to the prompt within 60 s. Try again."
	}
	return msg
}
