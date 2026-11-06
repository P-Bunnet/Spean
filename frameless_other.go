//go:build !darwin

package main

import "github.com/wailsapp/wails/v2/pkg/options"

// window: keep the OS frame until v1.0 ships custom controls for Windows/Linux.
func window(*options.App) {}
