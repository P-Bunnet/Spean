// Package transfer copies files between any two filesystems (local or SFTP over
// a chain), streaming through this machine. remote → remote is the scp -3 model.
package transfer

import (
	"io"
	"os"
	"path"
	"path/filepath"
	"time"

	"github.com/pkg/sftp"
)

// FS is the subset of file operations a transfer needs. Two implementations: Local and sftp.
type FS interface {
	Open(string) (io.ReadCloser, error)
	Create(string) (io.WriteCloser, error)
	Stat(string) (os.FileInfo, error)  // follows symlinks
	Lstat(string) (os.FileInfo, error) // does not
	ReadDir(string) ([]os.FileInfo, error)
	MkdirAll(string) error
	Chmod(string, os.FileMode) error
	Chtimes(string, time.Time) error
	Remove(string) error // file or empty dir
	Join(...string) string
	Base(string) string
}

// Local is the machine Spean runs on.
type Local struct{}

func (Local) Open(p string) (io.ReadCloser, error)    { return os.Open(p) }
func (Local) Create(p string) (io.WriteCloser, error) { return os.Create(p) }
func (Local) Stat(p string) (os.FileInfo, error)      { return os.Stat(p) }
func (Local) Lstat(p string) (os.FileInfo, error)     { return os.Lstat(p) }
func (Local) MkdirAll(p string) error                 { return os.MkdirAll(p, 0755) }
func (Local) Chmod(p string, m os.FileMode) error     { return os.Chmod(p, m) }
func (Local) Chtimes(p string, t time.Time) error     { return os.Chtimes(p, t, t) }
func (Local) Remove(p string) error                   { return os.Remove(p) }
func (Local) Join(e ...string) string                 { return filepath.Join(e...) }
func (Local) Base(p string) string                    { return filepath.Base(p) }
func (Local) ReadDir(p string) ([]os.FileInfo, error) {
	ents, err := os.ReadDir(p)
	if err != nil {
		return nil, err
	}
	out := make([]os.FileInfo, 0, len(ents))
	for _, e := range ents {
		if fi, err := e.Info(); err == nil {
			out = append(out, fi)
		}
	}
	return out, nil
}

// Remote wraps an sftp client. Paths are always POSIX.
type Remote struct{ C *sftp.Client }

func (r Remote) Open(p string) (io.ReadCloser, error)    { return r.C.Open(p) }
func (r Remote) Create(p string) (io.WriteCloser, error) { return r.C.Create(p) }
func (r Remote) Stat(p string) (os.FileInfo, error)      { return r.C.Stat(p) }
func (r Remote) Lstat(p string) (os.FileInfo, error)     { return r.C.Lstat(p) }
func (r Remote) ReadDir(p string) ([]os.FileInfo, error) { return r.C.ReadDir(p) }
func (r Remote) MkdirAll(p string) error                 { return r.C.MkdirAll(p) }
func (r Remote) Chmod(p string, m os.FileMode) error     { return r.C.Chmod(p, m) }
func (r Remote) Chtimes(p string, t time.Time) error     { return r.C.Chtimes(p, t, t) }
func (r Remote) Join(e ...string) string                 { return path.Join(e...) }
func (r Remote) Base(p string) string                    { return path.Base(p) }
func (r Remote) Remove(p string) error {
	if fi, err := r.C.Lstat(p); err == nil && fi.IsDir() {
		return r.C.RemoveDirectory(p)
	}
	return r.C.Remove(p)
}
