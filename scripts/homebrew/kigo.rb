class Kigo < Formula
  desc "AI-powered coding assistant for the terminal"
  homepage "https://github.com/kingiol/kigo-cli"
  url "https://github.com/kingiol/kigo-cli/releases/download/v<VERSION>/kigo-macos"
  sha256 "<SHA256>"
  license "MIT"

  def install
    bin.install "kigo-macos" => "kigo"
  end

  test do
    system "#{bin}/kigo", "--version"
  end
end
