package transfer

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestLocalToLocal(t *testing.T) {
	root := t.TempDir()
	src := filepath.Join(root, "src")
	os.MkdirAll(filepath.Join(src, "sub"), 0755)
	os.WriteFile(filepath.Join(src, "a.txt"), []byte("hello"), 0600)
	os.WriteFile(filepath.Join(src, "sub", "b.txt"), []byte("world!"), 0644)
	dst := filepath.Join(root, "dst")
	os.MkdirAll(dst, 0755)

	done := make(chan *Job, 64)
	e := New(1)
	e.Resolve = func(string) (FS, error) { return Local{}, nil }
	e.Emit = func(j *Job) {
		if j.Status == "done" || j.Status == "error" {
			done <- j
		}
	}
	e.Ask = func(string) string { return "rename" }

	wait := func() *Job {
		select {
		case j := <-done:
			return j
		case <-time.After(5 * time.Second):
			t.Fatal("timeout")
			return nil
		}
	}
	e.Start(Endpoint{Src: "local", Paths: []string{src}}, Endpoint{Src: "local", Dir: dst}, false)
	j := wait()
	if j.Status != "done" || j.Total != 11 || j.Bytes != 11 || len(j.Items) != 2 {
		t.Fatalf("job = %+v", j)
	}
	if b, _ := os.ReadFile(filepath.Join(dst, "src", "sub", "b.txt")); string(b) != "world!" {
		t.Fatalf("b.txt = %q", b)
	}
	if fi, _ := os.Stat(filepath.Join(dst, "src", "a.txt")); fi.Mode().Perm() != 0600 {
		t.Fatalf("mode not preserved: %v", fi.Mode())
	}

	// second copy of a single file into a dir where it exists → rename policy
	e.Start(Endpoint{Src: "local", Paths: []string{filepath.Join(src, "a.txt")}}, Endpoint{Src: "local", Dir: filepath.Join(dst, "src")}, true)
	j = wait()
	if j.Status != "done" || j.Policy != "rename" {
		t.Fatalf("job = %+v", j)
	}
	if _, err := os.Stat(filepath.Join(dst, "src", "a (1).txt")); err != nil {
		t.Fatal("renamed copy missing")
	}
	if _, err := os.Stat(filepath.Join(src, "a.txt")); err == nil {
		t.Fatal("move did not remove source")
	}
}
