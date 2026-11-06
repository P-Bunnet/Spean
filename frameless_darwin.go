package main

import (
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

// window: hidden title bar with the traffic lights over our own chrome (Frontend pads for them).
// Do not set Frameless: Wails then drops NSWindowStyleMaskTitled, which removes the traffic lights.
func window(o *options.App) {
	o.Mac = &mac.Options{TitleBar: mac.TitleBarHidden(), Appearance: mac.NSAppearanceNameDarkAqua}
}
