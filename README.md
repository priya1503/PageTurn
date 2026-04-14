# 📖 PageTurn — Modern EPUB Reader

A beautiful, feature-rich EPUB reader built for the browser. PageTurn delivers a premium reading experience with deep customization, rich page-turn animations, 9 handcrafted themes, bookmarks, in-book search, and reading progress tracking — all running entirely client-side with zero server uploads.

---

## ✨ Features

### 📚 Core Reading
- **Open any EPUB** — Load files via click, file picker, or drag-and-drop (anywhere on the page)
- **Paginated layout** — Book-like paginated reading with continuous scroll support
- **Keyboard navigation** — Arrow keys, Page Up/Down, Home key, and Space bar
- **Click navigation** — Hoverable left/right arrow buttons overlaid on the reader
- **Chapter tracking** — Auto-detects and highlights the current chapter in the sidebar

### 🎨 9 Themes with Deep Content Theming
Every theme transforms the **entire application** — toolbar, sidebar, reader background, AND the actual book text content inside the reader iframe:

| Theme | Description | Style |
|-------|-------------|-------|
| **Light** | Clean white with indigo accents | ☀️ Light |
| **Dark** | Deep navy-charcoal with soft purple accents | 🌙 Dark |
| **Sepia** | Warm vintage parchment for long reads | 📜 Warm |
| **Ocean** | Deep blue nautical dark theme | 🌊 Dark |
| **Forest** | Rich dark green nature theme | 🌲 Dark |
| **Rose** | Soft pink warmth | 🌹 Light |
| **Lavender** | Calm purple light theme | 💜 Light |
| **Nord** | Popular arctic blue-grey developer theme | ❄️ Dark |
| **High Contrast** | Black/white for maximum accessibility | ♿ Dark |

> **How content theming works:** Unlike simple wrapper theming, PageTurn injects a complete CSS stylesheet directly into each epub.js iframe using `rendition.hooks.content`. This ensures headings, paragraphs, links, code blocks, tables, and even text selection colors all match your chosen theme — with `!important` overrides to guarantee it works even with heavily styled EPUBs.

### 📄 Page Turn Animations
Choose from 5 animation styles (or disable them entirely):

| Animation | Effect |
|-----------|--------|
| **Slide** | Pages slide horizontally with a smooth crossfade |
| **Fade** | Elegant opacity crossfade |
| **Flip** | 3D perspective book-like page flip |
| **Scale** | Page zooms out and back in with fade |
| **Curl** | 3D diagonal page curl with dynamic shadows |
| **None** | Instant, no animation |

Animations are CSS-driven via `data-page-anim` attributes and `@keyframes`, ensuring smooth 60fps performance.

### 🔤 Typography Controls
- **Font family** — Sans-serif (Inter), Serif (Merriweather), or Monospace (JetBrains Mono)
- **Font size** — Adjustable slider from 70% to 160%
- **Line height** — Adjustable from 1.2 to 2.4
- **Content width** — Slider from 500px to 1100px

### 🔖 Bookmarks
- Toggle bookmarks with **Ctrl+D** or the toolbar bookmark button
- Visual bookmark ribbon appears on bookmarked pages
- All bookmarks listed in the sidebar with chapter name and timestamp
- Click any bookmark to jump directly to that location
- Per-book persistence — each book's bookmarks are saved separately

### 🔍 In-Book Search
- Full-text search across all chapters (debounced, 400ms)
- Results show matched text with keyword highlighting
- Click any result to jump to that location in the book
- Accessible via **Ctrl+F** or the sidebar Search tab

### 📊 Reading Progress
- Visual progress bar at the bottom with percentage indicator
- Hover to reveal a draggable thumb handle
- Click anywhere on the bar to jump to that position
- Auto-saves reading position — resume exactly where you left off
- Powered by epub.js locations for accurate percentage calculation

### 📚 Book Library
- Recently opened books displayed on the landing page with cover thumbnails
- Book covers extracted and stored as data URLs in IndexedDB
- "Clear All" button to reset the library

### ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `←` / `→` | Previous / Next page |
| `Page Up` / `Page Down` | Previous / Next page |
| `Home` | Go to beginning |
| `Ctrl+O` | Open file |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+D` | Toggle bookmark |
| `Ctrl+F` | Open search |
| `Ctrl+,` | Open settings |
| `F11` | Toggle fullscreen |
| `Escape` | Close settings panel |

---

## 🏗️ Architecture

PageTurn follows a **modular ES module architecture** with a pub/sub event bus for decoupled communication between components.

```
epub-reader/
├── index.html                 # App shell (semantic HTML5, CSP, SEO)
├── package.json               # Vite + epubjs + jszip
├── vite.config.js             # Dev server config
├── README.md                  # This file
├── public/                    # Static assets
└── src/
    ├── styles/
    │   ├── index.css          # Master stylesheet (imports all partials)
    │   ├── variables.css      # Design tokens + 9 theme definitions
    │   ├── layout.css         # CSS Grid app shell + responsive
    │   ├── components.css     # All UI component styles
    │   ├── reader.css         # Reader viewport + bookmark ribbon
    │   └── animations.css     # Page turn animations + micro-animations
    └── js/
        ├── app.js             # Main orchestrator — wires everything
        ├── eventBus.js        # Pub/sub event system
        ├── bookManager.js     # EPUB loading (File API) + metadata extraction
        ├── readerUI.js        # Rendition management + iframe content theming
        ├── settingsManager.js # Theme, animation, font, typography controls
        ├── bookmarkManager.js # Bookmark CRUD + sidebar UI
        ├── searchManager.js   # Full-text search across sections
        ├── progressTracker.js # Reading position + progress bar
        ├── libraryManager.js  # Recent books (IndexedDB)
        ├── storage.js         # localStorage + IndexedDB utilities
        └── utils.js           # Validation, DOM helpers, debounce/throttle
```

### Module Communication
All modules communicate through the **EventBus** — a simple publish/subscribe system. No module directly references another except through events:

```
book:opened → ReaderUI.init(), BookmarkManager.init(), SearchManager.init(), etc.
settings:changed → ReaderUI.applyTheme() / updateSetting()
reader:relocated → ProgressTracker.update(), BookmarkManager.updateCurrentPosition()
navigate:cfi → ReaderUI.goTo()
```

### Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Vanilla JS (no framework)** | Zero overhead, fast startup, full control |
| **CSS Custom Properties** | One `data-theme` attribute swap repaints the entire UI |
| **epub.js content hooks** | Only reliable way to theme iframe book content |
| **IndexedDB for library** | Handles large cover image data URLs without localStorage limits |
| **localStorage for settings** | Instant synchronous read on page load |
| **Debounced search** | Prevents excessive DOM manipulation during typing |

---

## 🔐 Security

- **Client-side only** — All file processing happens in the browser. No files are ever uploaded to a server.
- **Content Security Policy** — Strict CSP meta tag limits script/style/font/image sources
- **Iframe sandboxing** — epub.js renders EPUB content in isolated iframes
- **File validation** — Extension checks, MIME type validation, and 500MB size limit before processing
- **HTML escaping** — All user-facing strings (bookmarks, titles, search results) are escaped to prevent XSS
- **Input sanitization** — File input only accepts `.epub` and `application/epub+zip`

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or later
- npm (comes with Node.js)

### Installation

```bash
# Navigate to the project
cd Epub_reader

# Install dependencies
npm install

# Start the development server
npm run dev
```

The app will open automatically at **http://localhost:3000**.

### Production Build

```bash
npm run build
npm run preview
```

The production bundle is output to `dist/`.

---

## 📖 Usage

1. **Open a book** — Drag an `.epub` file onto the page, or click "Open EPUB File"
2. **Read** — Use arrow keys, click the navigation arrows, or the progress bar
3. **Customize** — Click the ⚙️ gear icon to access theme, animation, font, and typography settings
4. **Bookmark** — Press `Ctrl+D` or click the ribbon/bookmark icon
5. **Search** — Press `Ctrl+F` or click the "Search" tab in the sidebar
6. **Navigate chapters** — Toggle the sidebar with `Ctrl+B` and click any chapter

---

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| [Vite](https://vitejs.dev/) | Build tool with fast HMR |
| [epub.js](https://github.com/futurepress/epub.js) | EPUB rendering engine |
| [JSZip](https://stuk.github.io/jszip/) | ZIP extraction for EPUB files |
| [Inter](https://rsms.me/inter/) | Primary UI font |
| [Merriweather](https://fonts.google.com/specimen/Merriweather) | Serif reading font |
| [JetBrains Mono](https://www.jetbrains.com/lp/mono/) | Monospace reading font |

---

## 📝 License

This project is provided as-is for personal and educational use.
