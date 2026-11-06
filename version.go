package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"golang.org/x/mod/semver"
)

// version is set at build time: -ldflags "-X main.version=v1.0.0" (see Makefile). "dev" otherwise.
var version = "dev"

func (a *App) Version() string { return version }

const releasesAPI = "https://api.github.com/repos/P-Bunnet/Spean/releases/latest"

type Update struct {
	Current string `json:"current"`
	Latest  string `json:"latest"`
	URL     string `json:"url"`
	Newer   bool   `json:"newer"`
}

// CheckUpdate asks GitHub for the latest release tag. Opt-in (settings.updateCheck) and the only
// network call Spean makes on its own. Never downloads anything.
func (a *App) CheckUpdate() (*Update, error) {
	c := &http.Client{Timeout: 8 * time.Second}
	req, _ := http.NewRequest("GET", releasesAPI, nil)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "spean/"+version)
	resp, err := c.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var r struct {
		Tag string `json:"tag_name"`
		URL string `json:"html_url"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&r); err != nil {
		return nil, err
	}
	u := &Update{Current: version, Latest: r.Tag, URL: r.URL}
	cur := version
	if !strings.HasPrefix(cur, "v") {
		cur = "v" + cur
	}
	u.Newer = semver.IsValid(r.Tag) && semver.IsValid(cur) && semver.Compare(r.Tag, cur) > 0
	return u, nil
}
