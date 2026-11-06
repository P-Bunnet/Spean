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
Requirements: https://signpath.org/terms. The repo must be public, and the app must already be released in the form to be signed, so the first release ships unsigned.

1. Turn on multi-factor authentication on GitHub. SignPath needs it there and on its own account.
2. Apply at https://signpath.org/apply.
3. After approval, in SignPath:
   - Add the predefined GitHub.com trusted build system and link it to the project.
   - Create project `spean` with signing policy `release-signing`. Other names need the same change in `release.yml`.
   - Set `packaging/signpath/artifact-configuration.xml` as the artifact configuration.
   - Create a CI user with submitter permission and copy its API token.
4. In GitHub → Settings → Secrets and variables → Actions:
   - Secret `SIGNPATH_API_TOKEN`: the token.
   - Variable `SIGNPATH_ORGANIZATION_ID`: the organization ID. Setting it turns signing on in `release.yml`.
5. Publish a release, then approve the signing request in SignPath within 4 hours. `release.yml` waits for it.
6. Release with `scripts/release.sh 0.24.0`. It keeps `productVersion` in `wails.json` equal to the tag, which signing checks.
