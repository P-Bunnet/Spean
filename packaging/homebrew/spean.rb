# Homebrew cask for the tap P-Bunnet/homebrew-tap. The release job fills version + sha256
# and attaches the result to every GitHub Release as spean.rb; copy it into the tap repo.
cask "spean" do
  version "__VERSION__"
  sha256 "__SHA256__"

  url "https://github.com/P-Bunnet/Spean/releases/download/v#{version}/spean-v#{version}-macos-universal.zip"
  name "Spean"
  desc "Free, local-first SSH client with unlimited jump-host chaining"
  homepage "https://github.com/P-Bunnet/Spean"

  livecheck do
    url :url
    strategy :github_latest
  end

  app "spean.app", target: "Spean.app"

  zap trash: "~/Library/Application Support/spean"
end
