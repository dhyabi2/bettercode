<p align="center">
  <a href="https://nanocode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="شعار NanoCode">
    </picture>
  </a>
</p>
<p align="center">وكيل برمجة بالذكاء الاصطناعي مفتوح المصدر.</p>
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

### التثبيت

```bash
# YOLO
curl -fsSL https://nanocode.ai/install | bash

# مديري الحزم
npm i -g nanocode-ai@latest        # او bun/pnpm/yarn
scoop install nanocode             # Windows
choco install nanocode             # Windows
brew install dhyabi2/tap/nanocode # macOS و Linux (موصى به، دائما محدث)
brew install nanocode              # macOS و Linux (صيغة brew الرسمية، تحديث اقل)
sudo pacman -S nanocode            # Arch Linux (Stable)
paru -S nanocode-bin               # Arch Linux (Latest from AUR)
mise use -g nanocode               # اي نظام
nix run nixpkgs#nanocode           # او github:dhyabi2/nanocode لاحدث فرع dev
```

> [!TIP]
> احذف الاصدارات الاقدم من 0.1.x قبل التثبيت.

### تطبيق سطح المكتب (BETA)

يتوفر NanoCode ايضا كتطبيق سطح مكتب. قم بالتنزيل مباشرة من [صفحة الاصدارات](https://github.com/dhyabi2/nanocode/releases) او من [nanocode.ai/download](https://nanocode.ai/download).

| المنصة                | التنزيل                            |
| --------------------- | ---------------------------------- |
| macOS (Apple Silicon) | `nanocode-desktop-mac-arm64.dmg`   |
| macOS (Intel)         | `nanocode-desktop-mac-x64.dmg`     |
| Windows               | `nanocode-desktop-windows-x64.exe` |
| Linux                 | `.deb` او `.rpm` او AppImage       |

```bash
# macOS (Homebrew)
brew install --cask nanocode-desktop
# Windows (Scoop)
scoop bucket add extras; scoop install extras/nanocode-desktop
```

#### مجلد التثبيت

يحترم سكربت التثبيت ترتيب الاولوية التالي لمسار التثبيت:

1. `$NANOCODE_INSTALL_DIR` - مجلد تثبيت مخصص
2. `$XDG_BIN_DIR` - مسار متوافق مع مواصفات XDG Base Directory
3. `$HOME/bin` - مجلد الثنائيات القياسي للمستخدم (ان وجد او امكن انشاؤه)
4. `$HOME/.nanocode/bin` - المسار الافتراضي الاحتياطي

```bash
# امثلة
NANOCODE_INSTALL_DIR=/usr/local/bin curl -fsSL https://nanocode.ai/install | bash
XDG_BIN_DIR=$HOME/.local/bin curl -fsSL https://nanocode.ai/install | bash
```

### Agents

يتضمن NanoCode وكيليْن (Agents) مدمجين يمكنك التبديل بينهما باستخدام زر `Tab`.

- **build** - الافتراضي، وكيل بصلاحيات كاملة لاعمال التطوير
- **plan** - وكيل للقراءة فقط للتحليل واستكشاف الكود
  - يرفض تعديل الملفات افتراضيا
  - يطلب الاذن قبل تشغيل اوامر bash
  - مثالي لاستكشاف قواعد كود غير مألوفة او لتخطيط التغييرات

بالاضافة الى ذلك يوجد وكيل فرعي **general** للبحث المعقد والمهام متعددة الخطوات.
يستخدم داخليا ويمكن استدعاؤه بكتابة `@general` في الرسائل.

تعرف على المزيد حول [agents](https://nanocode.ai/docs/agents).

### التوثيق

لمزيد من المعلومات حول كيفية ضبط NanoCode، [**راجع التوثيق**](https://nanocode.ai/docs).

### المساهمة

اذا كنت مهتما بالمساهمة في NanoCode، يرجى قراءة [contributing docs](./CONTRIBUTING.md) قبل ارسال pull request.

### البناء فوق NanoCode

اذا كنت تعمل على مشروع مرتبط بـ NanoCode ويستخدم "nanocode" كجزء من اسمه (مثل "nanocode-dashboard" او "nanocode-mobile")، يرجى اضافة ملاحظة في README توضح انه ليس مبنيا بواسطة فريق NanoCode ولا يرتبط بنا بأي شكل.

---

**انضم الى مجتمعنا** [Discord](https://discord.gg/nanocode) | [X.com](https://x.com/nanocode)
