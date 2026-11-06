# Spean build tasks. `make` or `make help` lists them.
SHELL   := /bin/bash
WAILS   ?= $(shell command -v wails 2>/dev/null || echo $(shell go env GOPATH)/bin/wails)
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
DIST    := dist
LDFLAGS := -X main.version=$(VERSION)

.DEFAULT_GOAL := help

help: ## list targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n",$$1,$$2}'

setup: ## install Wails CLI, Go modules, npm deps
	go install github.com/wailsapp/wails/v2/cmd/wails@latest
	go mod download
	cd frontend && npm ci
	$(WAILS) doctor

dev: ## run with live reload
	$(WAILS) dev

gen: ## regenerate frontend/wailsjs bindings after changing bound methods
	$(WAILS) generate module

check: ## go vet + tsc typecheck
	go vet ./...
	cd frontend && npx tsc -b

test: ## go tests
	go test ./...

lint: check ## alias

build: ## macOS app for this machine → build/bin/spean.app (ad-hoc signed)
	$(WAILS) build -clean -ldflags "$(LDFLAGS)"
	$(MAKE) adhoc-sign

adhoc-sign: ## free signing: no "damaged app" on Apple Silicon; Gatekeeper still asks once (right-click → Open)
	@[ -d build/bin/spean.app ] && codesign --force --deep --sign - build/bin/spean.app && codesign --verify --deep build/bin/spean.app && echo "ad-hoc signed" || true

build-all: ## macOS universal + Windows amd64 from this Mac → dist/ (Linux needs GTK: see CI)
	rm -rf $(DIST) && mkdir -p $(DIST)
	$(WAILS) build -clean -platform darwin/universal -ldflags "$(LDFLAGS)"
	$(MAKE) adhoc-sign
	ditto -c -k --keepParent build/bin/spean.app $(DIST)/spean-$(VERSION)-macos-universal.zip
	$(WAILS) build -clean -platform windows/amd64 -ldflags "$(LDFLAGS)"
	zip -j $(DIST)/spean-$(VERSION)-windows-amd64.zip build/bin/spean.exe
	cd $(DIST) && shasum -a 256 * > SHA256SUMS
	@ls -lh $(DIST)

build-linux: ## Linux amd64 via Docker (GTK/WebKit CGO cannot cross-compile)
	docker run --rm -v "$(PWD)":/src -w /src golang:1.26 bash -c \
	  "apt-get update -qq && apt-get install -y -qq libgtk-3-dev libwebkit2gtk-4.1-dev nodejs npm >/dev/null && \
	   go install github.com/wailsapp/wails/v2/cmd/wails@v2.16.0 && cd frontend && npm ci && cd .. && \
	   /go/bin/wails build -clean -platform linux/amd64 -tags webkit2_41 -ldflags '$(LDFLAGS)'"

cross-check: ## vet + build for windows/linux without CGO (catches platform code early)
	GOOS=windows GOARCH=amd64 go vet ./... && GOOS=windows GOARCH=amd64 go build -o /dev/null .
	GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -o /dev/null ./internal/...

run: build ## build then launch the app
	open build/bin/spean.app

icon: ## regenerate app icons from build/logo.svg with transparent corners (needs Chrome); Wails remakes icon.ico from appicon.png
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --default-background-color=00000000 --window-size=1024,1024 --screenshot="$(PWD)/build/appicon.png" "file://$(PWD)/build/logo.svg"
	rm -f build/windows/icon.ico

clean: ## remove build outputs
	rm -rf build/bin $(DIST) frontend/dist/* && touch frontend/dist/.keep

release: ## publish a version: make release VERSION=0.24.0 (see scripts/release.sh)
	scripts/release.sh $(VERSION)

.PHONY: help setup dev gen check test lint build adhoc-sign build-all build-linux cross-check run icon clean release
