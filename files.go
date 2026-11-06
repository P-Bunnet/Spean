package main

import (
	"bytes"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"spean/internal/transfer"
)

// ---- files, the power bits (v0.18) ---------------------------------------------

type TreeCount struct {
	Files int   `json:"files"`
	Dirs  int   `json:"dirs"`
	Bytes int64 `json:"bytes"`
}

// CountTree sizes a path before a recursive delete so the confirm can say what goes.
func (a *App) CountTree(src, p string) (*TreeCount, error) {
	f, err := a.fs(src)
	if err != nil {
		return nil, err
	}
	p = expandHome(src, p)
	var c TreeCount
	var walk func(string) error
	walk = func(q string) error {
		fi, err := f.Lstat(q)
		if err != nil {
			return err
		}
		if fi.IsDir() {
			c.Dirs++
			ents, err := f.ReadDir(q)
			if err != nil {
				return err
			}
			for _, e := range ents {
				if err := walk(f.Join(q, e.Name())); err != nil {
					return err
				}
			}
			return nil
		}
		c.Files++
		c.Bytes += fi.Size()
		return nil
	}
	return &c, walk(p)
}

// DeleteTree removes a file or a whole directory. The UI confirms with CountTree first.
func (a *App) DeleteTree(src, p string) error {
	f, err := a.fs(src)
	if err != nil {
		return err
	}
	return transfer.RemoveAll(f, expandHome(src, p))
}

func (a *App) Chmod(src, p string, mode string) error {
	f, err := a.fs(src)
	if err != nil {
		return err
	}
	m, err := strconv.ParseUint(mode, 8, 32)
	if err != nil {
		return errors.New("mode is octal, e.g. 644 or 755")
	}
	return f.Chmod(expandHome(src, p), os.FileMode(m))
}

// SearchFiles finds names containing q under dir (case-insensitive), up to limit hits.
// Remote: one `find` over the tab's chain. Local: filepath.WalkDir.
func (a *App) SearchFiles(src, dir, q string, limit int) ([]string, error) {
	q = strings.TrimSpace(q)
	if q == "" {
		return nil, nil
	}
	if limit <= 0 {
		limit = 200
	}
	dir = expandHome(src, dir)
	if src == "local" {
		var out []string
		lq := strings.ToLower(q)
		filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			if len(out) >= limit {
				return fs.SkipAll
			}
			if p != dir && strings.Contains(strings.ToLower(d.Name()), lq) {
				out = append(out, p)
			}
			if d.IsDir() && (d.Name() == "node_modules" || d.Name() == ".git") {
				return fs.SkipDir
			}
			return nil
		})
		return out, nil
	}
	t := a.get(src)
	if t == nil || t.chain == nil {
		return nil, errors.New("tab not connected")
	}
	pat := "*" + strings.NewReplacer("'", "'\\''", "*", "\\*", "?", "\\?").Replace(q) + "*"
	r, err := execOn(t.chain.Client(), fmt.Sprintf("find %s -iname '%s' 2>/dev/null | head -n %d", shq(dir), pat, limit))
	if err != nil {
		return nil, err
	}
	lines := strings.Split(strings.TrimSpace(r.Stdout), "\n")
	out := lines[:0]
	for _, l := range lines {
		if l != "" {
			out = append(out, l)
		}
	}
	sort.Strings(out)
	return out, nil
}

func shq(s string) string { return "'" + strings.ReplaceAll(s, "'", "'\\''") + "'" }

type Preview struct {
	Kind string `json:"kind"` // text | image | binary
	Text string `json:"text,omitempty"`
	Data string `json:"data,omitempty"` // data: URL for images
	Size int64  `json:"size"`
	More bool   `json:"more"` // text was cut
}

var imageExt = map[string]string{".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml"}

// ReadPreview returns the first 64 KB of a text file, or an image up to 4 MB as a data URL.
func (a *App) ReadPreview(src, p string) (*Preview, error) {
	f, err := a.fs(src)
	if err != nil {
		return nil, err
	}
	p = expandHome(src, p)
	fi, err := f.Stat(p)
	if err != nil {
		return nil, err
	}
	pv := &Preview{Size: fi.Size()}
	r, err := f.Open(p)
	if err != nil {
		return nil, err
	}
	defer r.Close()
	if mime, ok := imageExt[strings.ToLower(path.Ext(p))]; ok {
		if fi.Size() > 4<<20 {
			pv.Kind = "binary"
			return pv, nil
		}
		b, err := io.ReadAll(r)
		if err != nil {
			return nil, err
		}
		pv.Kind, pv.Data = "image", "data:"+mime+";base64,"+base64.StdEncoding.EncodeToString(b)
		return pv, nil
	}
	b, err := io.ReadAll(io.LimitReader(r, 64<<10))
	if err != nil {
		return nil, err
	}
	if bytes.IndexByte(b, 0) >= 0 {
		pv.Kind = "binary"
		return pv, nil
	}
	pv.Kind, pv.Text, pv.More = "text", string(b), fi.Size() > int64(len(b))
	return pv, nil
}

type Disk struct {
	Total int64  `json:"total"`
	Used  int64  `json:"used"`
	Avail int64  `json:"avail"`
	Mount string `json:"mount"`
}

// DiskUsage runs `df -Pk` for a path, locally or over the tab's chain (POSIX only).
func (a *App) DiskUsage(src, p string) (*Disk, error) {
	p = expandHome(src, p)
	var out string
	if src == "local" {
		b, err := exec.Command("df", "-Pk", p).Output()
		if err != nil {
			return nil, err
		}
		out = string(b)
	} else {
		t := a.get(src)
		if t == nil || t.chain == nil {
			return nil, errors.New("tab not connected")
		}
		r, err := execOn(t.chain.Client(), "df -Pk "+shq(p))
		if err != nil || r.Exit != 0 {
			return nil, errors.New("df failed")
		}
		out = r.Stdout
	}
	lines := strings.Split(strings.TrimSpace(out), "\n")
	if len(lines) < 2 {
		return nil, errors.New("no df output")
	}
	fld := strings.Fields(lines[len(lines)-1])
	if len(fld) < 6 {
		return nil, errors.New("bad df output")
	}
	k := func(s string) int64 { n, _ := strconv.ParseInt(s, 10, 64); return n * 1024 }
	return &Disk{Total: k(fld[1]), Used: k(fld[2]), Avail: k(fld[3]), Mount: fld[5]}, nil
}
