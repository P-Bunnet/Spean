package vault

import "testing"

func TestRoundTrip(t *testing.T) {
	p := t.TempDir() + "/vault.json"
	v := New(p)
	if err := v.Create("hunter2"); err != nil {
		t.Fatal(err)
	}
	if err := v.SetHost("prod", Secret{Password: "pw"}); err != nil {
		t.Fatal(err)
	}
	if err := v.SetKey("deploy", "-----BEGIN-----"); err != nil {
		t.Fatal(err)
	}
	v.Lock()
	if _, ok := v.Host("prod"); ok {
		t.Fatal("readable while locked")
	}
	if err := New(p).Unlock("wrong"); err != ErrBadPw {
		t.Fatalf("wrong password: %v", err)
	}
	w := New(p) // fresh instance = another machine with the same file
	if err := w.Unlock("hunter2"); err != nil {
		t.Fatal(err)
	}
	if s, _ := w.Host("prod"); s.Password != "pw" {
		t.Fatalf("secret = %+v", s)
	}
	if k, _ := w.Key("deploy"); k != "-----BEGIN-----" {
		t.Fatal("key lost")
	}
}
