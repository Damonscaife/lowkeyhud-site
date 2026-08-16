# lowkeyhud — desktop overlay

A quiet, always-on-top heads-up display for your screen: the time, a rotating
roast, and a focus timer. It sits in the corner and stays out of the way.

Built with Electron (transparent, frameless, always-on-top window).

## Run it locally

```bash
npm install
npm start
```

Drag the card to move it. Hover it to reveal the controls, or click `⋯` (or
right-click a non-drag area) for options: show/hide time and roast,
click-through mode, opacity, focus length, launch at login, and quit.

## Build installers

```bash
npm run dist        # for your current OS
npm run dist:mac    # .dmg + .zip
npm run dist:win    # NSIS installer + portable .exe
npm run dist:linux  # AppImage
```

Output lands in `dist/`.

## Notes

- **Icons**: `npm run dist` regenerates `assets/icon.png` (no dependencies).
  electron-builder converts it per-platform where it can. For a fully polished
  icon you'll want a proper `.icns` (mac) and `.ico` (win) later.
- **Code signing**: builds are unsigned by default. On macOS, unsigned apps
  trigger Gatekeeper — sign + notarize with an Apple Developer account before
  distributing. On Windows, SmartScreen shows a warning until you sign.
- **Settings** are stored in the OS user-data dir (`settings.json`).
