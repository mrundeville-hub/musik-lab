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

### Want to modify it?

Fork the repo on GitHub (button top-right), or just edit your local clone — it's
yours to change. Adding a new experiment takes one folder; see
[docs/ADDING_EXPERIMENT.md](docs/ADDING_EXPERIMENT.md).

## Experiments

- **Spirit Masks** (`/e/spirit-masks`) — face-tracked particle masks with hand-gesture switching
- **Eye Type** (`/e/eye-type`) — face tracking finds your eyes and emits colliding letters
- **Ripple** (`/e/ascii-ripple`) — webcam ASCII mirror with fingertip-triggered ripples
- **Garden** (`/e/ascii-garden`) — pinch gestures grow procedural ASCII flowers
- **Breath Garden** (`/e/breath-garden`) — hand-gesture dandelion interaction
- **Constellation** (`/e/constellation`) — fingertips become stars connected by ASCII lines
- **Butterfly** (`/e/butterfly`) — procedural ASCII butterfly with generative glass audio

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

### Хочешь изменить?

Сделай форк репозитория на GitHub (кнопка сверху справа) или просто правь свой
локальный клон — он твой. Чтобы добавить новый эксперимент, нужна одна папка —
см. [docs/ADDING_EXPERIMENT.md](docs/ADDING_EXPERIMENT.md).

### Эксперименты

- **Spirit Masks** (`/e/spirit-masks`) — маски из частиц по лицу, переключение жестами руки
- **Eye Type** (`/e/eye-type`) — трекинг лица находит глаза и сыпет сталкивающиеся буквы
- **Ripple** (`/e/ascii-ripple`) — ASCII-зеркало с камеры, рябь от кончиков пальцев
- **Garden** (`/e/ascii-garden`) — щипок пальцами выращивает процедурные ASCII-цветы
- **Breath Garden** (`/e/breath-garden`) — взаимодействие с одуванчиком жестами
- **Constellation** (`/e/constellation`) — кончики пальцев становятся звёздами, соединёнными ASCII-линиями
- **Butterfly** (`/e/butterfly`) — процедурная ASCII-бабочка с генеративным «стеклянным» звуком

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
