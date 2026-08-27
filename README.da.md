<p align="center">
  <a href="https://nanocode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="NanoCode logo">
    </picture>
  </a>
</p>
<p align="center">Den open source AI-kodeagent.</p>
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

# Pakkehåndteringer
npm i -g nanocode-ai@latest        # eller bun/pnpm/yarn
scoop install nanocode             # Windows
choco install nanocode             # Windows
brew install dhyabi2/tap/nanocode # macOS og Linux (anbefalet, altid up to date)
brew install nanocode              # macOS og Linux (officiel brew formula, opdateres sjældnere)
sudo pacman -S nanocode            # Arch Linux (Stable)
paru -S nanocode-bin               # Arch Linux (Latest from AUR)
mise use -g nanocode               # alle OS
nix run nixpkgs#nanocode           # eller github:dhyabi2/nanocode for nyeste dev-branch
```

> [!TIP]
> Fjern versioner ældre end 0.1.x før installation.

### Desktop-app (BETA)

NanoCode findes også som desktop-app. Download direkte fra [releases-siden](https://github.com/dhyabi2/nanocode/releases) eller [nanocode.ai/download](https://nanocode.ai/download).

| Platform              | Download                           |
| --------------------- | ---------------------------------- |
| macOS (Apple Silicon) | `nanocode-desktop-mac-arm64.dmg`   |
| macOS (Intel)         | `nanocode-desktop-mac-x64.dmg`     |
| Windows               | `nanocode-desktop-windows-x64.exe` |
| Linux                 | `.deb`, `.rpm`, eller AppImage     |

```bash
# macOS (Homebrew)
brew install --cask nanocode-desktop
# Windows (Scoop)
scoop bucket add extras; scoop install extras/nanocode-desktop
```

#### Installationsmappe

Installationsscriptet bruger følgende prioriteringsrækkefølge for installationsstien:

1. `$NANOCODE_INSTALL_DIR` - Tilpasset installationsmappe
2. `$XDG_BIN_DIR` - Sti der følger XDG Base Directory Specification
3. `$HOME/bin` - Standard bruger-bin-mappe (hvis den findes eller kan oprettes)
4. `$HOME/.nanocode/bin` - Standard fallback

```bash
# Eksempler
NANOCODE_INSTALL_DIR=/usr/local/bin curl -fsSL https://nanocode.ai/install | bash
XDG_BIN_DIR=$HOME/.local/bin curl -fsSL https://nanocode.ai/install | bash
```

### Agents

NanoCode har to indbyggede agents, som du kan skifte mellem med `Tab`-tasten.

- **build** - Standard, agent med fuld adgang til udviklingsarbejde
- **plan** - Skrivebeskyttet agent til analyse og kodeudforskning
  - Afviser filredigering som standard
  - Spørger om tilladelse før bash-kommandoer
  - Ideel til at udforske ukendte kodebaser eller planlægge ændringer

Derudover findes der en **general**-subagent til komplekse søgninger og flertrinsopgaver.
Den bruges internt og kan kaldes via `@general` i beskeder.

Læs mere om [agents](https://nanocode.ai/docs/agents).

### Dokumentation

For mere info om konfiguration af NanoCode, [**se vores docs**](https://nanocode.ai/docs).

### Bidrag

Hvis du vil bidrage til NanoCode, så læs vores [contributing docs](./CONTRIBUTING.md) før du sender en pull request.

### Bygget på NanoCode

Hvis du arbejder på et projekt der er relateret til NanoCode og bruger "nanocode" som en del af navnet; f.eks. "nanocode-dashboard" eller "nanocode-mobile", så tilføj en note i din README, der tydeliggør at projektet ikke er bygget af NanoCode-teamet og ikke er tilknyttet os på nogen måde.

---

**Bliv en del af vores community** [Discord](https://discord.gg/nanocode) | [X.com](https://x.com/nanocode)
