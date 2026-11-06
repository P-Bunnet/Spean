package main

import "testing"

func TestPortRegex(t *testing.T) {
	m := ssRe.FindStringSubmatch(`LISTEN 0      128          0.0.0.0:22       0.0.0.0:*    users:(("sshd",pid=812,fd=3))`)
	if m == nil || m[2] != "22" || m[3] != "sshd" {
		t.Fatalf("ss: %v", m)
	}
	m = ssRe.FindStringSubmatch(`LISTEN 0      4096       127.0.0.1:5432     0.0.0.0:*`)
	if m == nil || m[1] != "127.0.0.1" || m[2] != "5432" {
		t.Fatalf("ss no proc: %v", m)
	}
	m = netstatRe.FindStringSubmatch(`tcp        0      0 0.0.0.0:8080            0.0.0.0:*               LISTEN      1234/docker-proxy`)
	if m == nil || m[2] != "8080" || m[3] != "docker-proxy" {
		t.Fatalf("netstat: %v", m)
	}
}
