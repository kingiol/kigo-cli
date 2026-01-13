# Homebrew Setup Guide for Kigo

This guide explains how to set up Homebrew installation support for `kigo-cli`.

## Prerequisites

1.  A GitHub repository for your Tap, named `homebrew-kigo` (or similar).
2.  `kigo-cli` releases published to GitHub with pre-built binaries (using `pkg`).

## Steps to Create a Tap

1.  **Create the Repository**:
    Create a new public repository on GitHub named `homebrew-kigo`.

2.  **Add the Formula**:
    In the root of `homebrew-kigo`, create a file named `kigo.rb`.
    You can use the template provided in `scripts/homebrew/kigo.rb` of this project.

3.  **Update the Formula**:
    -   Update `url` to point to the tarball of your release.
    -   Update `sha256` with the checksum of the tarball.
    -   Ensure the `bin.install` command matches your binary name.

## Installing via Homebrew

Once the Tap is set up, users can install `kigo-cli` using:

```bash
brew tap <your-username>/kigo
brew install kigo
```

## Automating Updates

You can automate updating the formula using GitHub Actions in the `homebrew-kigo` repository, or by including a step in your main project's release workflow to dispatch an event to the Tap repository.
