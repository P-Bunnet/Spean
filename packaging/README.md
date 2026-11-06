# Packaging (free path, no paid certificates)

Every tag `vX.Y.Z` makes CI (`.github/workflows/release.yml`) build macOS/Linux/Windows, ad-hoc sign the
`.app`, and attach to the GitHub Release: the archives, `SHA256SUMS`, a filled `spean.rb`, and filled
winget manifests.

## Homebrew (macOS, recommended — no Gatekeeper prompt)
1. Create repo `P-Bunnet/homebrew-tap` with a `Casks/` folder.
2. After each release, copy the attached `spean.rb` to `Casks/spean.rb` and push.
3. Users: `brew install --cask P-Bunnet/tap/spean`.

## winget (Windows)
Submit the three `winget/*.yaml` files from the release to `microsoft/winget-pkgs` under
`manifests/p/P-Bunnet/Spean/<version>/` (PR; `wingetcreate` can do it). Users: `winget install P-Bunnet.Spean`.

## Direct download
macOS: right-click → Open once (or `xattr -dr com.apple.quarantine Spean.app`). Windows: SmartScreen → More info → Run anyway.

## SignPath (free Authenticode for open source)
Apply at signpath.org/open-source once the repo is public and CI is green; then add their signing step
to `release.yml` for the Windows job.
