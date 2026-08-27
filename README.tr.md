<p align="center">
  <a href="https://nanocode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="NanoCode logo">
    </picture>
  </a>
</p>
<p align="center">Açık kaynaklı yapay zeka kodlama asistanı.</p>
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

### Kurulum

```bash
# YOLO
curl -fsSL https://nanocode.ai/install | bash

# Paket yöneticileri
npm i -g nanocode-ai@latest        # veya bun/pnpm/yarn
scoop install nanocode             # Windows
choco install nanocode             # Windows
brew install dhyabi2/tap/nanocode # macOS ve Linux (önerilir, her zaman güncel)
brew install nanocode              # macOS ve Linux (resmi brew formülü, daha az güncellenir)
sudo pacman -S nanocode            # Arch Linux (Stable)
paru -S nanocode-bin               # Arch Linux (Latest from AUR)
mise use -g nanocode               # Tüm işletim sistemleri
nix run nixpkgs#nanocode           # veya en güncel geliştirme dalı için github:dhyabi2/nanocode
```

> [!TIP]
> Kurulumdan önce 0.1.x'ten eski sürümleri kaldırın.

### Masaüstü Uygulaması (BETA)

NanoCode ayrıca masaüstü uygulaması olarak da mevcuttur. Doğrudan [sürüm sayfasından](https://github.com/dhyabi2/nanocode/releases) veya [nanocode.ai/download](https://nanocode.ai/download) adresinden indirebilirsiniz.

| Platform              | İndirme                            |
| --------------------- | ---------------------------------- |
| macOS (Apple Silicon) | `nanocode-desktop-mac-arm64.dmg`   |
| macOS (Intel)         | `nanocode-desktop-mac-x64.dmg`     |
| Windows               | `nanocode-desktop-windows-x64.exe` |
| Linux                 | `.deb`, `.rpm` veya AppImage       |

```bash
# macOS (Homebrew)
brew install --cask nanocode-desktop
# Windows (Scoop)
scoop bucket add extras; scoop install extras/nanocode-desktop
```

#### Kurulum Dizini (Installation Directory)

Kurulum betiği (install script), kurulum yolu (installation path) için aşağıdaki öncelik sırasını takip eder:

1. `$NANOCODE_INSTALL_DIR` - Özel kurulum dizini
2. `$XDG_BIN_DIR` - XDG Base Directory Specification uyumlu yol
3. `$HOME/bin` - Standart kullanıcı binary dizini (varsa veya oluşturulabiliyorsa)
4. `$HOME/.nanocode/bin` - Varsayılan yedek konum

```bash
# Örnekler
NANOCODE_INSTALL_DIR=/usr/local/bin curl -fsSL https://nanocode.ai/install | bash
XDG_BIN_DIR=$HOME/.local/bin curl -fsSL https://nanocode.ai/install | bash
```

### Ajanlar

NanoCode, `Tab` tuşuyla aralarında geçiş yapabileceğiniz iki yerleşik (built-in) ajan içerir.

- **build** - Varsayılan, geliştirme çalışmaları için tam erişimli ajan
- **plan** - Analiz ve kod keşfi için salt okunur ajan
  - Varsayılan olarak dosya düzenlemelerini reddeder
  - Bash komutlarını çalıştırmadan önce izin ister
  - Tanımadığınız kod tabanlarını keşfetmek veya değişiklikleri planlamak için ideal

Ayrıca, karmaşık aramalar ve çok adımlı görevler için bir **genel** alt ajan bulunmaktadır.
Bu dahili olarak kullanılır ve mesajlarda `@general` ile çağrılabilir.

[Ajanlar](https://nanocode.ai/docs/agents) hakkında daha fazla bilgi edinin.

### Dokümantasyon

NanoCode'u nasıl yapılandıracağınız hakkında daha fazla bilgi için [**dokümantasyonumuza göz atın**](https://nanocode.ai/docs).

### Katkıda Bulunma

NanoCode'a katkıda bulunmak istiyorsanız, lütfen bir pull request göndermeden önce [katkıda bulunma dokümanlarımızı](./CONTRIBUTING.md) okuyun.

### NanoCode Üzerine Geliştirme

NanoCode ile ilgili bir proje üzerinde çalışıyorsanız ve projenizin adının bir parçası olarak "nanocode" kullanıyorsanız (örneğin, "nanocode-dashboard" veya "nanocode-mobile"), lütfen README dosyanıza projenin NanoCode ekibi tarafından geliştirilmediğini ve bizimle hiçbir şekilde bağlantılı olmadığını belirten bir not ekleyin.

---

**Topluluğumuza katılın** [Discord](https://discord.gg/nanocode) | [X.com](https://x.com/nanocode)
