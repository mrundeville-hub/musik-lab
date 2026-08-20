# MUSIK.LAB

Interactive creative-coding lab — a gallery of small webcam-driven experiments.
Built with React, TypeScript, Vite, Tailwind CSS, MediaPipe, Canvas 2D, Three.js
and Rapier. Each piece opens in a fullscreen stage with pause, reset, fullscreen,
info and local video recording.

> [Русская версия ниже](#musiklab-русский)

---

## Quick start (English)

You need **Node.js 20+** and a modern browser with a webcam.

```bash
# 1. Get the code
git clone https://github.com/mrundeville-hub/musik-lab.git
cd musik-lab

# 2. Install dependencies
npm install

# 3. Run the dev server
npm run dev
```

Then open **http://localhost:5173/** in your browser. Pick an experiment from the
home page, or jump straight to one at `http://localhost:5173/e/<slug>`.

The browser will ask for **camera permission** — it is required for the
experiments. Camera frames never leave your machine (see [Privacy](#privacy)).

> Camera access needs `localhost` or HTTPS. `npm run dev` serves on `localhost`,
> so it works out of the box.

### Build for production

```bash
npm run build     # output goes to dist/
npm run preview   # serve the production build locally
npm run lint      # check code style
```

The `dist/` folder is static — deploy it to any static host (GitHub Pages,
Netlify, Vercel, Cloudflare Pages, etc.). The site must be served over HTTPS for
the camera to work in production.

### Deploy

SPA fallback is preconfigured (`public/_redirects` for Netlify/Cloudflare Pages,
`vercel.json` for Vercel), so deep links like `/e/<slug>` work out of the box.

```bash
npx netlify deploy --prod --dir=dist        # Netlify
npx vercel --prod                           # Vercel
npx wrangler pages deploy dist              # Cloudflare Pages
```

### Want a desktop app instead?

If you'd rather run it as a native window (Electron) instead of in a browser:

```bash
npm run desktop          # build and launch in a native window
npm run desktop:build    # package a distributable .app (macOS only)
```

`npm run desktop` works on any OS; `desktop:build` uses electron-builder and is
configured for macOS.

### Want to modify it?

Fork the repo on GitHub (button top-right), or just edit your local clone — it's
yours to change. Adding a new experiment takes one folder; see
[docs/ADDING_EXPERIMENT.md](docs/ADDING_EXPERIMENT.md).

## Experiments

- **ASCII Forecast** (`/e/ascii-forecast`) — your face becomes a live ASCII weather map
- **Garden** (`/e/ascii-garden`) — pinch to water a bed of ASCII flowers
- **Ripple** (`/e/ascii-ripple`) — fingertips splash a live ASCII mirror
- **Snowfall** (`/e/ascii-snowfall`) — typed letters settle on your silhouette
- **Breath Garden** (`/e/breath-garden`) — hold a dandelion and blow the seeds away
- **Butterfly** (`/e/butterfly`) — a lazy butterfly perches on your fingertip
- **Cat Gestures** (`/e/cat-gestures`) — show a gesture, get the matching cat meme
- **Choir Hands** (`/e/choir-hands`) — each fingertip is a voice in a glass choir
- **Constellation** (`/e/constellation`) — ten fingertips become a living night sky
- **CRT Snow** (`/e/crt-snow`) — your webcam through a dying CRT
- **Eye Type** (`/e/eye-type`) — letters pour from your eyes and pile up
- **Flower Control** (`/e/flower-control`) — pinch to scrub a flower open and shut
- **Foggy Pane** (`/e/foggy-pane`) — breathe fog onto the glass, then wipe it clear
- **Hand Instrument** (`/e/hand-instrument`) — pinch a lead, open a palm for harmony
- **Heart Pinch** (`/e/heart-pinch`) — make a finger-heart and pour falling hearts
- **Iris Kaleidoscope** (`/e/iris-kaleidoscope`) — your pupils become kaleidoscope hubs
- **Lace Curtain** (`/e/lace-curtain`) — part a Soviet lace curtain with two fingers
- **Match Light** (`/e/match-light`) — strike a match. The rest of the room goes dark
- **Mercury Face** (`/e/mercury-face`) — your silhouette fills with liquid metal
- **Mouth Aquarium** (`/e/mouth-aquarium`) — open your mouth and ASCII fish swim out
- **Orbit Loom** (`/e/orbit-loom`) — fingertips weave elastic orbital springs
- **Palm Gravity** (`/e/palm-gravity`) — an open palm swallows quotes into a black hole
- **Paper Airplane** (`/e/paper-airplane`) — fold a plane from your face and flick it
- **Radio Dial** (`/e/radio-dial`) — rotate an open palm to tune glass stations
- **Shadow Twin** (`/e/shadow-twin`) — your shadow lags — and sometimes walks off
- **Soap Film** (`/e/soap-film`) — stretch a rainbow film until it pops
- **Spirit Masks** (`/e/spirit-masks`) — a trembling mask locks onto your face
- **String Between Us** (`/e/string-between`) — a glass string rings between two index fingers
- **Subtitle Body** (`/e/subtitle-body`) — captions crawl your silhouette like burned-in text
- **Thermal Window** (`/e/thermal-window`) — two pinches open a live thermal window
- **Two-Hand Loom** (`/e/two-hand-loom`) — pluck hanging threads and stitch them together
- **Typewriter Gaze** (`/e/typewriter-gaze`) — look to type. Blink for space

## Project structure

```text
src/
  app/                 route-level pages
  experiments/         one folder per experiment
    <slug>/
      Experiment.tsx   experiment implementation
      metadata.ts      title, slug, tags, controls, tech notes
      index.ts         default export for lazy loading
  shared/
    components/        shell, webcam gate, FPS meter, status UI
    hooks/             animation loop, canvas sizing, webcam, recorder
    lib/               MediaPipe + audio helpers
public/                masks, flower videos, icons
```

`src/experiments/registry.ts` uses `import.meta.glob` to discover experiment
folders automatically — add a folder with `metadata.ts` and `index.ts` and it
appears on the home page and at `/e/<slug>` without touching route code.

## Recording

The shell records the visible stage by compositing the rendered `<video>` and
`<canvas>` layers into an offscreen canvas and saving through `MediaRecorder`,
mixing in the experiment's live Web Audio. Recording stays entirely local;
stopping a recording downloads a `.webm` (or `.mp4`) file.

## Privacy

Webcam access starts only after an explicit user gesture. Video is used locally
for rendering and tracking inside the browser. **The app never uploads camera
frames.** MediaPipe model and WASM assets are loaded from the official CDN at
runtime.

---

## MUSIK.LAB (Русский)

Интерактивная лаборатория creative-coding — галерея небольших экспериментов,
управляемых веб-камерой. Сделано на React, TypeScript, Vite, Tailwind CSS,
MediaPipe, Canvas 2D, Three.js и Rapier. Каждый эксперимент открывается на весь
экран с паузой, сбросом, полноэкранным режимом, инфо и локальной записью видео.

### Быстрый старт

Нужен **Node.js 20+** и современный браузер с веб-камерой.

```bash
# 1. Скачать код
git clone https://github.com/mrundeville-hub/musik-lab.git
cd musik-lab

# 2. Установить зависимости
npm install

# 3. Запустить дев-сервер
npm run dev
```

Открой **http://localhost:5173/** в браузере. Выбери эксперимент на главной или
зайди сразу по адресу `http://localhost:5173/e/<slug>`.

Браузер попросит **доступ к камере** — он нужен для работы экспериментов. Кадры с
камеры никогда не покидают твой компьютер (см. [Приватность](#приватность)).

> Для доступа к камере нужен `localhost` или HTTPS. `npm run dev` работает на
> `localhost`, так что всё заводится сразу.

### Сборка для продакшена

```bash
npm run build     # результат в папке dist/
npm run preview   # локально посмотреть прод-сборку
npm run lint      # проверить стиль кода
```

Папка `dist/` — статика, её можно выложить на любой статический хостинг (GitHub
Pages, Netlify, Vercel, Cloudflare Pages и т.д.). В продакшене сайт должен
открываться по HTTPS, иначе камера не заработает.

### Хочешь десктопное приложение?

Если хочешь запускать не в браузере, а отдельным нативным окном (Electron):

```bash
npm run desktop          # собрать и запустить в нативном окне
npm run desktop:build    # упаковать .app для распространения (только macOS)
```

`npm run desktop` работает на любой ОС; `desktop:build` использует
electron-builder и настроен под macOS.

### Хочешь изменить?

Сделай форк репозитория на GitHub (кнопка сверху справа) или просто правь свой
локальный клон — он твой. Чтобы добавить новый эксперимент, нужна одна папка —
см. [docs/ADDING_EXPERIMENT.md](docs/ADDING_EXPERIMENT.md).

### Эксперименты

- **ASCII Forecast** (`/e/ascii-forecast`) — твоё лицо становится живой ASCII-картой погоды
- **Garden** (`/e/ascii-garden`) — щипок поливает клумбу ASCII-цветов
- **Ripple** (`/e/ascii-ripple`) — кончики пальцев плещут по живому ASCII-зеркалу
- **Snowfall** (`/e/ascii-snowfall`) — набранные буквы ложатся на твой силуэт
- **Breath Garden** (`/e/breath-garden`) — держи одуванчик и сдуй с него семена
- **Butterfly** (`/e/butterfly`) — ленивая бабочка садится на кончик пальца
- **Cat Gestures** (`/e/cat-gestures`) — показываешь жест — получаешь подходящий кото-мем
- **Choir Hands** (`/e/choir-hands`) — каждый кончик пальца — голос в стеклянном хоре
- **Constellation** (`/e/constellation`) — десять пальцев складываются в живое ночное небо
- **CRT Snow** (`/e/crt-snow`) — твоя камера через умирающий кинескоп
- **Eye Type** (`/e/eye-type`) — буквы сыплются из глаз и копятся внизу
- **Flower Control** (`/e/flower-control`) — щипком прокручиваешь раскрытие цветка
- **Foggy Pane** (`/e/foggy-pane`) — подыши на стекло, потом протри его
- **Hand Instrument** (`/e/hand-instrument`) — щипок играет лид, раскрытая ладонь — гармонию
- **Heart Pinch** (`/e/heart-pinch`) — сложи сердечко пальцами и высыпь дождь сердец
- **Iris Kaleidoscope** (`/e/iris-kaleidoscope`) — зрачки становятся центрами калейдоскопа
- **Lace Curtain** (`/e/lace-curtain`) — раздвинь двумя пальцами советскую тюль
- **Match Light** (`/e/match-light`) — чиркни спичкой — остальная комната гаснет
- **Mercury Face** (`/e/mercury-face`) — твой силуэт заливается жидким металлом
- **Mouth Aquarium** (`/e/mouth-aquarium`) — открой рот, и оттуда выплывают ASCII-рыбы
- **Orbit Loom** (`/e/orbit-loom`) — пальцы плетут упругие орбитальные пружины
- **Palm Gravity** (`/e/palm-gravity`) — раскрытая ладонь затягивает цитаты в чёрную дыру
- **Paper Airplane** (`/e/paper-airplane`) — сложи самолётик из своего лица и запусти его
- **Radio Dial** (`/e/radio-dial`) — поворачивай ладонь, настраивая стеклянные станции
- **Shadow Twin** (`/e/shadow-twin`) — тень отстаёт — и иногда уходит сама
- **Soap Film** (`/e/soap-film`) — растягивай радужную плёнку, пока не лопнет
- **Spirit Masks** (`/e/spirit-masks`) — дрожащая маска цепляется за твоё лицо
- **String Between Us** (`/e/string-between`) — между двумя указательными звенит стеклянная струна
- **Subtitle Body** (`/e/subtitle-body`) — субтитры ползут по силуэту, как вжжённый текст
- **Thermal Window** (`/e/thermal-window`) — два щипка открывают живое термо-окно
- **Two-Hand Loom** (`/e/two-hand-loom`) — щипли висящие нити и стягивай их в узор
- **Typewriter Gaze** (`/e/typewriter-gaze`) — печатай взглядом. Моргни — пробел

### Запись

Оболочка записывает видимую сцену, склеивая слои `<video>` и `<canvas>` в
закадровый canvas и сохраняя через `MediaRecorder`, подмешивая живой Web Audio
эксперимента. Запись полностью локальная; по остановке скачивается файл `.webm`
(или `.mp4`).

### Приватность

Доступ к камере включается только после явного действия пользователя. Видео
используется локально для отрисовки и трекинга прямо в браузере. **Приложение
никогда не загружает кадры с камеры на сервер.** Модели и WASM-ассеты MediaPipe
подгружаются с официального CDN во время работы.
