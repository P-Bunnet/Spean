package transfer

import (
	"context"
	"fmt"
	"io"
	"os"
	"sort"
	"strings"
	"sync"
	"time"
)

// Endpoint names a filesystem ("local" or a tab id) and paths on it.
type Endpoint struct {
	Src   string   `json:"src"`
	Paths []string `json:"paths,omitempty"` // source files/dirs
	Dir   string   `json:"dir,omitempty"`   // target directory
}

// Item is one file inside a job.
type Item struct {
	From   string `json:"from"`
	To     string `json:"to"`
	Size   int64  `json:"size"`
	Status string `json:"status"` // pending | done | skipped | error
	Err    string `json:"err,omitempty"`
	mode   os.FileMode
	mtime  time.Time
}

// Job is one drop. It is emitted whole on every progress event.
// ponytail: fields are written by the job goroutine and read by Emit/Jobs without a lock;
// a torn read shows a stale number for one tick, nothing worse. Add a mutex if that ever matters.
type Job struct {
	ID      string   `json:"id"`
	From    Endpoint `json:"from"`
	To      Endpoint `json:"to"`
	Move    bool     `json:"move"`
	Policy  string   `json:"policy"` // "" (ask) | overwrite | skip | rename | newer
	Status  string   `json:"status"` // queued | running | done | error | cancelled
	Items   []*Item  `json:"items"`
	Done    int      `json:"done"`  // items finished (any status)
	Bytes   int64    `json:"bytes"` // bytes copied
	Total   int64    `json:"total"`
	Current string   `json:"current"`
	BPS     float64  `json:"bps"`
	Err     string   `json:"err,omitempty"`

	cancel context.CancelFunc
}

// Engine runs jobs, at most Concurrency at a time.
type Engine struct {
	Resolve func(src string) (FS, error) // "local" or tab id → FS
	Emit    func(job *Job)               // called on every change (throttled while copying)
	Ask     func(msg string) string      // conflict policy prompt; returns overwrite|skip|rename|newer
	sem     chan struct{}
	mu      sync.Mutex
	jobs    map[string]*Job
	nextID  int
}

func New(concurrency int) *Engine {
	return &Engine{sem: make(chan struct{}, concurrency), jobs: map[string]*Job{}}
}

// Jobs lists all jobs, oldest first.
func (e *Engine) Jobs() []*Job {
	e.mu.Lock()
	defer e.mu.Unlock()
	out := make([]*Job, 0, len(e.jobs))
	for _, j := range e.jobs {
		out = append(out, j)
	}
	sort.Slice(out, func(i, k int) bool { return out[i].ID < out[k].ID })
	return out
}

// Start queues a job and returns its id.
func (e *Engine) Start(from, to Endpoint, move bool) string {
	e.mu.Lock()
	e.nextID++
	j := &Job{ID: fmt.Sprintf("%06d", e.nextID), From: from, To: to, Move: move, Status: "queued"}
	e.jobs[j.ID] = j
	e.mu.Unlock()
	e.Emit(j)
	go e.run(j, nil)
	return j.ID
}

func (e *Engine) Cancel(id string) {
	e.mu.Lock()
	j := e.jobs[id]
	e.mu.Unlock()
	if j != nil && j.cancel != nil {
		j.cancel()
	}
}

// Retry re-runs only the failed items of a finished job.
func (e *Engine) Retry(id string) {
	e.mu.Lock()
	j := e.jobs[id]
	e.mu.Unlock()
	if j == nil || j.Status == "running" || j.Status == "queued" {
		return
	}
	var failed []*Item
	for _, it := range j.Items {
		if it.Status == "error" {
			it.Status, it.Err = "pending", ""
			failed = append(failed, it)
		}
	}
	j.Status, j.Err = "queued", ""
	e.Emit(j)
	go e.run(j, failed)
}

// run executes a job. items == nil means walk sources fresh; otherwise only those items.
func (e *Engine) run(j *Job, items []*Item) {
	e.sem <- struct{}{}
	defer func() { <-e.sem }()

	ctx, cancel := context.WithCancel(context.Background())
	j.cancel = cancel
	defer cancel()
	j.Status = "running"

	fail := func(err error) {
		j.Status, j.Err = "error", err.Error()
		e.Emit(j)
	}
	src, err := e.Resolve(j.From.Src)
	if err != nil {
		fail(err)
		return
	}
	dst, err := e.Resolve(j.To.Src)
	if err != nil {
		fail(err)
		return
	}
	var dirs []string
	if items == nil {
		j.Items, j.Total, j.Done, j.Bytes = nil, 0, 0, 0
		for _, p := range j.From.Paths {
			if err := e.walk(src, dst, p, dst.Join(j.To.Dir, src.Base(p)), j, &dirs); err != nil {
				fail(err)
				return
			}
		}
		items = j.Items
	}
	e.Emit(j)

	for _, d := range dirs {
		if err := dst.MkdirAll(d); err != nil {
			fail(fmt.Errorf("mkdir %s: %w", d, err))
			return
		}
	}
	last := time.Now()
	for _, it := range items {
		if ctx.Err() != nil {
			break
		}
		j.Current = it.From
		if err := e.copyOne(ctx, src, dst, it, j, &last); err != nil {
			if ctx.Err() != nil {
				break
			}
			it.Status, it.Err = "error", err.Error()
		}
		j.Done++
		e.Emit(j)
	}
	j.Current, j.BPS = "", 0
	if ctx.Err() != nil {
		j.Status = "cancelled"
		e.Emit(j)
		return
	}
	failed := 0
	for _, it := range j.Items {
		if it.Status == "error" {
			failed++
		}
	}
	if failed > 0 {
		j.Status, j.Err = "error", fmt.Sprintf("%d file(s) failed", failed)
	} else {
		j.Status = "done"
		if j.Move { // delete sources only when everything landed
			for _, p := range j.From.Paths {
				if err := removeAll(src, p); err != nil {
					j.Err = "copied, but could not remove source: " + err.Error()
				}
			}
		}
	}
	e.Emit(j)
}

// walk lists src recursively into j.Items; target dirs go to dirs (parents first).
func (e *Engine) walk(src, dst FS, from, to string, j *Job, dirs *[]string) error {
	fi, err := src.Lstat(from)
	if err != nil {
		return err
	}
	if fi.Mode()&os.ModeSymlink != 0 { // cp -L: follow to the target's content
		if fi, err = src.Stat(from); err != nil {
			j.Items = append(j.Items, &Item{From: from, To: to, Status: "error", Err: "dangling symlink"})
			return nil
		}
	}
	switch {
	case fi.IsDir():
		*dirs = append(*dirs, to)
		ents, err := src.ReadDir(from)
		if err != nil {
			return err
		}
		for _, ent := range ents {
			if err := e.walk(src, dst, src.Join(from, ent.Name()), dst.Join(to, ent.Name()), j, dirs); err != nil {
				return err
			}
		}
	case fi.Mode().IsRegular():
		j.Items = append(j.Items, &Item{From: from, To: to, Size: fi.Size(), Status: "pending", mode: fi.Mode().Perm(), mtime: fi.ModTime()})
		j.Total += fi.Size()
	default:
		j.Items = append(j.Items, &Item{From: from, To: to, Status: "skipped", Err: "special file"})
	}
	return nil
}

func (e *Engine) copyOne(ctx context.Context, src, dst FS, it *Item, j *Job, last *time.Time) error {
	if it.Status != "pending" {
		return nil
	}
	if existing, err := dst.Stat(it.To); err == nil {
		if j.Policy == "" {
			j.Policy = e.Ask(fmt.Sprintf("%s already exists in %s", dst.Base(it.To), j.To.Dir))
			if j.Policy == "" {
				j.Policy = "skip"
			}
		}
		switch j.Policy {
		case "skip":
			it.Status = "skipped"
			return nil
		case "newer":
			if !it.mtime.After(existing.ModTime()) {
				it.Status = "skipped"
				return nil
			}
		case "rename":
			it.To = freeName(dst, it.To)
		}
	}
	r, err := src.Open(it.From)
	if err != nil {
		return err
	}
	defer r.Close()
	w, err := dst.Create(it.To)
	if err != nil {
		return err
	}
	cw := &counter{ctx: ctx, w: w, j: j, e: e, last: last}
	_, err = io.Copy(cw, r) // src may implement WriterTo (sftp.File does): fast path stays
	if cerr := w.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		dst.Remove(it.To) // partial target
		return err
	}
	dst.Chmod(it.To, it.mode)    // best effort
	dst.Chtimes(it.To, it.mtime) // best effort
	it.Status = "done"
	return nil
}

// counter counts bytes, throttles progress events, and aborts on cancel.
type counter struct {
	ctx      context.Context
	w        io.Writer
	j        *Job
	e        *Engine
	last     *time.Time
	winStart time.Time
	winBytes int64
}

func (c *counter) Write(p []byte) (int, error) {
	if err := c.ctx.Err(); err != nil {
		return 0, err
	}
	n, err := c.w.Write(p)
	c.j.Bytes += int64(n)
	c.winBytes += int64(n)
	if now := time.Now(); now.Sub(*c.last) > 250*time.Millisecond {
		if !c.winStart.IsZero() {
			c.j.BPS = float64(c.winBytes) / now.Sub(c.winStart).Seconds()
		}
		c.winStart, c.winBytes = now, 0
		*c.last = now
		c.e.Emit(c.j)
	}
	return n, err
}

// freeName returns "name (1).ext", "name (2).ext", … the first that does not exist.
func freeName(fs FS, p string) string {
	base := fs.Base(p)
	dir := strings.TrimSuffix(p, base)
	ext := ""
	if i := strings.LastIndex(base, "."); i > 0 {
		base, ext = base[:i], base[i:]
	}
	for n := 1; ; n++ {
		cand := fs.Join(dir, fmt.Sprintf("%s (%d)%s", base, n, ext))
		if _, err := fs.Lstat(cand); err != nil {
			return cand
		}
	}
}

// RemoveAll deletes p and everything under it (symlinks are removed, never followed).
func RemoveAll(fs FS, p string) error { return removeAll(fs, p) }

func removeAll(fs FS, p string) error {
	fi, err := fs.Lstat(p)
	if err != nil {
		return err
	}
	if fi.IsDir() && fi.Mode()&os.ModeSymlink == 0 {
		ents, err := fs.ReadDir(p)
		if err != nil {
			return err
		}
		for _, ent := range ents {
			if err := removeAll(fs, fs.Join(p, ent.Name())); err != nil {
				return err
			}
		}
	}
	return fs.Remove(p)
}
