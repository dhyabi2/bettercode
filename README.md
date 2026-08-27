<p align="center">
  <a href="https://nanocode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="NanoCode logo">
    </picture>
  </a>
</p>
<p align="center">The open source AI coding agent.</p>
<p align="center">
  <a href="https://nanocode.ai/discord"><img alt="Discord" src="https://img.shields.io/discord/1391832426048651334?style=flat-square&label=discord" /></a>
  <a href="https://www.npmjs.com/package/nanocode-ai"><img alt="npm" src="https://img.shields.io/npm/v/nanocode-ai?style=flat-square" /></a>
  <a href="https://github.com/dhyabi2/nanocode/actions/workflows/publish.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/dhyabi2/nanocode/publish.yml?style=flat-square&branch=dev" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh.md">简体中文</a> |
  <a href="README.zht.md">繁體中文</a> |
  <a href="README.ko.md">한국어</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.it.md">Italiano</a> |
  <a href="README.da.md">Dansk</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.pl.md">Polski</a> |
  <a href="README.ru.md">Русский</a> |
  <a href="README.bs.md">Bosanski</a> |
  <a href="README.ar.md">العربية</a> |
  <a href="README.no.md">Norsk</a> |
  <a href="README.br.md">Português (Brasil)</a> |
  <a href="README.th.md">ไทย</a> |
  <a href="README.tr.md">Türkçe</a> |
  <a href="README.uk.md">Українська</a> |
  <a href="README.bn.md">বাংলা</a> |
  <a href="README.gr.md">Ελληνικά</a> |
  <a href="README.vi.md">Tiếng Việt</a>
</p>

[![NanoCode Terminal UI](packages/web/src/assets/lander/screenshot.png)](https://nanocode.ai)

---

### Installation

```bash
# YOLO
curl -fsSL https://nanocode.ai/install | bash

# Package managers
npm i -g nanocode-ai@latest        # or bun/pnpm/yarn
scoop install nanocode             # Windows
choco install nanocode             # Windows
brew install dhyabi2/tap/nanocode # macOS and Linux (recommended, always up to date)
brew install nanocode              # macOS and Linux (official brew formula, updated less)
sudo pacman -S nanocode            # Arch Linux (Stable)
paru -S nanocode-bin               # Arch Linux (Latest from AUR)
mise use -g nanocode               # Any OS
nix run nixpkgs#nanocode           # or github:dhyabi2/nanocode for latest dev branch
```

> [!TIP]
> Remove versions older than 0.1.x before installing.

### Desktop App (BETA)

NanoCode is also available as a desktop application. Download directly from the [releases page](https://github.com/dhyabi2/nanocode/releases) or [nanocode.ai/download](https://nanocode.ai/download).

| Platform              | Download                           |
| --------------------- | ---------------------------------- |
| macOS (Apple Silicon) | `nanocode-desktop-mac-arm64.dmg`   |
| macOS (Intel)         | `nanocode-desktop-mac-x64.dmg`     |
| Windows               | `nanocode-desktop-windows-x64.exe` |
| Linux                 | `.deb`, `.rpm`, or `.AppImage`     |

```bash
# macOS (Homebrew)
brew install --cask nanocode-desktop
# Windows (Scoop)
scoop bucket add extras; scoop install extras/nanocode-desktop
```

#### Installation Directory

The install script respects the following priority order for the installation path:

1. `$NANOCODE_INSTALL_DIR` - Custom installation directory
2. `$XDG_BIN_DIR` - XDG Base Directory Specification compliant path
3. `$HOME/bin` - Standard user binary directory (if it exists or can be created)
4. `$HOME/.nanocode/bin` - Default fallback

```bash
# Examples
NANOCODE_INSTALL_DIR=/usr/local/bin curl -fsSL https://nanocode.ai/install | bash
XDG_BIN_DIR=$HOME/.local/bin curl -fsSL https://nanocode.ai/install | bash
```

### Agents

NanoCode includes two built-in agents you can switch between with the `Tab` key.

- **build** - Default, full-access agent for development work
- **plan** - Read-only agent for analysis and code exploration
  - Denies file edits by default
  - Asks permission before running bash commands
  - Ideal for exploring unfamiliar codebases or planning changes

Also included is a **general** subagent for complex searches and multistep tasks.
This is used internally and can be invoked using `@general` in messages.

Learn more about [agents](https://nanocode.ai/docs/agents).

### Documentation

For more info on how to configure NanoCode, [**head over to our docs**](https://nanocode.ai/docs).

### Contributing

If you're interested in contributing to NanoCode, please read our [contributing docs](./CONTRIBUTING.md) before submitting a pull request.

### Building on NanoCode

If you are working on a project that's related to NanoCode and is using "nanocode" as part of its name, for example "nanocode-dashboard" or "nanocode-mobile", please add a note to your README to clarify that it is not built by the NanoCode team and is not affiliated with us in any way.

---

**Join our community** [Discord](https://discord.gg/nanocode) | [X.com](https://x.com/nanocode)
