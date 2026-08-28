<p align="center">
  <a href="https://bettercode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="BetterCode logo">
    </picture>
  </a>
</p>
<p align="center">Den open source AI-kodeagent.</p>
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
# YOLO
curl -fsSL https://bettercode.ai/install | bash

# Pakkehåndteringer
npm i -g bettercode-ai@latest        # eller bun/pnpm/yarn
scoop install bettercode             # Windows
choco install bettercode             # Windows
brew install dhyabi2/tap/bettercode # macOS og Linux (anbefalet, altid up to date)
brew install bettercode              # macOS og Linux (officiel brew formula, opdateres sjældnere)
sudo pacman -S bettercode            # Arch Linux (Stable)
paru -S bettercode-bin               # Arch Linux (Latest from AUR)
mise use -g bettercode               # alle OS
nix run nixpkgs#bettercode           # eller github:dhyabi2/bettercode for nyeste dev-branch
```

> [!TIP]
> Fjern versioner ældre end 0.1.x før installation.

### Desktop-app (BETA)

BetterCode findes også som desktop-app. Download direkte fra [releases-siden](https://github.com/dhyabi2/bettercode/releases) eller [bettercode.ai/download](https://bettercode.ai/download).

| Platform              | Download                           |
| --------------------- | ---------------------------------- |
| macOS (Apple Silicon) | `bettercode-desktop-mac-arm64.dmg`   |
| macOS (Intel)         | `bettercode-desktop-mac-x64.dmg`     |
| Windows               | `bettercode-desktop-windows-x64.exe` |
| Linux                 | `.deb`, `.rpm`, eller AppImage     |

```bash
# macOS (Homebrew)
brew install --cask bettercode-desktop
# Windows (Scoop)
scoop bucket add extras; scoop install extras/bettercode-desktop
```

#### Installationsmappe

Installationsscriptet bruger følgende prioriteringsrækkefølge for installationsstien:

1. `$BETTERCODE_INSTALL_DIR` - Tilpasset installationsmappe
2. `$XDG_BIN_DIR` - Sti der følger XDG Base Directory Specification
3. `$HOME/bin` - Standard bruger-bin-mappe (hvis den findes eller kan oprettes)
4. `$HOME/.bettercode/bin` - Standard fallback

```bash
# Eksempler
BETTERCODE_INSTALL_DIR=/usr/local/bin curl -fsSL https://bettercode.ai/install | bash
XDG_BIN_DIR=$HOME/.local/bin curl -fsSL https://bettercode.ai/install | bash
```

### Agents

BetterCode har to indbyggede agents, som du kan skifte mellem med `Tab`-tasten.

- **build** - Standard, agent med fuld adgang til udviklingsarbejde
- **plan** - Skrivebeskyttet agent til analyse og kodeudforskning
  - Afviser filredigering som standard
  - Spørger om tilladelse før bash-kommandoer
  - Ideel til at udforske ukendte kodebaser eller planlægge ændringer

Derudover findes der en **general**-subagent til komplekse søgninger og flertrinsopgaver.
Den bruges internt og kan kaldes via `@general` i beskeder.

Læs mere om [agents](https://bettercode.ai/docs/agents).

### Dokumentation

For mere info om konfiguration af BetterCode, [**se vores docs**](https://bettercode.ai/docs).

### Bidrag

Hvis du vil bidrage til BetterCode, så læs vores [contributing docs](./CONTRIBUTING.md) før du sender en pull request.

### Bygget på BetterCode

Hvis du arbejder på et projekt der er relateret til BetterCode og bruger "bettercode" som en del af navnet; f.eks. "bettercode-dashboard" eller "bettercode-mobile", så tilføj en note i din README, der tydeliggør at projektet ikke er bygget af BetterCode-teamet og ikke er tilknyttet os på nogen måde.

---

**Bliv en del af vores community** [Discord](https://discord.gg/bettercode) | [X.com](https://x.com/bettercode)
