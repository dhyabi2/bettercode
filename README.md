<p align="center">
  <a href="https://bettercode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="BetterCode logo">
    </picture>
  </a>
</p>
<p align="center">The open source AI coding agent.</p>
<p align="center">
  <a href="https://bettercode.ai/discord"><img alt="Discord" src="https://img.shields.io/discord/1391832426048651334?style=flat-square&label=discord" /></a>
  <a href="https://www.npmjs.com/package/bettercode-ai"><img alt="npm" src="https://img.shields.io/npm/v/bettercode-ai?style=flat-square" /></a>
  <a href="https://github.com/dhyabi2/bettercode/actions/workflows/publish.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/dhyabi2/bettercode/publish.yml?style=flat-square&branch=dev" /></a>
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

[![BetterCode Terminal UI](packages/web/src/assets/lander/screenshot.png)](https://bettercode.ai)

---

### Installation

```bash
curl -fsSL https://raw.githubusercontent.com/dhyabi2/bettercode/main/install | bash
```

Or grab the archive for your platform from the [releases page](https://github.com/dhyabi2/bettercode/releases/latest), extract it, and put the `bettercode` binary on your `PATH`. Prebuilt binaries: macOS (Apple Silicon, Intel), Linux (x64, arm64, glibc and musl), Windows (x64, arm64).

To install a specific version: `curl -fsSL .../install | bash -s -- --version 1.0.0` (or set `VERSION=1.0.0`).

> [!NOTE]
> npm, Homebrew, Scoop, AUR and Nix packages are not published yet.

#### Installation Directory

The install script respects the following priority order for the installation path:

1. `$BETTERCODE_INSTALL_DIR` - Custom installation directory
2. `$XDG_BIN_DIR` - XDG Base Directory Specification compliant path
3. `$HOME/bin` - Standard user binary directory (if it exists or can be created)
4. `$HOME/.bettercode/bin` - Default fallback

```bash
# Examples
BETTERCODE_INSTALL_DIR=/usr/local/bin curl -fsSL https://bettercode.ai/install | bash
XDG_BIN_DIR=$HOME/.local/bin curl -fsSL https://bettercode.ai/install | bash
```

### Agents

BetterCode includes two built-in agents you can switch between with the `Tab` key.

- **build** - Default, full-access agent for development work
- **plan** - Read-only agent for analysis and code exploration
  - Denies file edits by default
  - Asks permission before running bash commands
  - Ideal for exploring unfamiliar codebases or planning changes

Also included is a **general** subagent for complex searches and multistep tasks.
This is used internally and can be invoked using `@general` in messages.

Learn more about [agents](https://bettercode.ai/docs/agents).

### Documentation

For more info on how to configure BetterCode, [**head over to our docs**](https://bettercode.ai/docs).

### Contributing

If you're interested in contributing to BetterCode, please read our [contributing docs](./CONTRIBUTING.md) before submitting a pull request.

### Building on BetterCode

If you are working on a project that's related to BetterCode and is using "bettercode" as part of its name, for example "bettercode-dashboard" or "bettercode-mobile", please add a note to your README to clarify that it is not built by the BetterCode team and is not affiliated with us in any way.

---

**Join our community** [Discord](https://discord.gg/bettercode) | [X.com](https://x.com/bettercode)
