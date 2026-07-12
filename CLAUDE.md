# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A self-contained vanilla JavaScript Tetris game using HTML5 Canvas. No framework, no build step, no package manager, no dependencies, and no tests. Three source files: `index.html`, `style.css`, `game.js`. The `README.md` (in Spanish) is player-oriented documentation with a similar architecture breakdown.

## Running the game

There is nothing to install or build. Either:

```bash
start index.html       # Windows, or just double-click the file
```

or serve it statically (avoids any file:// quirks):

```bash
python -m http.server 8000
# or: npx serve .
```

then open `http://localhost:8000`.

## Architecture

All game logic lives in `game.js` (~300 lines, `'use strict'`, module-level `let` state, no build/bundling).

- **State model**: `board` is a `ROWS × COLS` matrix; each cell holds `0` (empty) or a color index `1–7` matching `COLORS`/`PIECES`. Mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, ...) is reset by `init()`.
- **Pieces**: `PIECES[1..7]` are square matrices (I, O, T, S, Z, J, L). `rotateCW()` rotates via transpose + row-reverse. `randomPiece()` picks a type 1–7.
- **Core mechanics**: `collide()` (bounds + overlap check) underlies all movement. `tryRotate()` applies rotation with `±1`/`±2` column wall-kicks, falling back to no-op if all kicks collide. `ghostY()` projects the landing row for the ghost piece and `hardDrop()`. `softDrop()` and `lockPiece()` → `merge()` + `clearLines()` + `spawn()` handle piece locking.
- **Game loop**: `loop(ts)` is a `requestAnimationFrame` loop accumulating `dropAccum`; when it exceeds `dropInterval`, the piece drops one row (or locks), then `draw()` runs.
- **Scoring/level**: line clears use `LINE_SCORES` (`[0,100,300,500,800]`) × current `level`; hard drop adds 2 points/cell dropped, soft drop 1 point/row. `level = floor(lines/10) + 1`; drop speed = `max(100, 1000 - (level-1)*90)` ms — both recalculated in `clearLines()`.
- **Rendering**: `draw()` renders grid + locked board + ghost piece (alpha 0.2) + current piece onto `#board`; `drawNext()` renders the upcoming piece onto `#next-canvas`. `drawBlock()` is the shared per-cell renderer used by both.
- **Input**: a single `keydown` listener maps arrows/`X`/`Space`/`P` to movement, rotation, soft/hard drop, and `togglePause()`. The overlay div shows PAUSA/GAME OVER text; `endGame()` fires from `spawn()` when a freshly spawned piece already collides. The restart button calls `init()`.

## Key gotchas

- `<canvas id="board">`'s `width`/`height` attributes in `index.html` (300×600) are hardcoded and must equal `COLS × BLOCK` and `ROWS × BLOCK` from `game.js`. If you change `COLS`, `ROWS`, or `BLOCK`, update the canvas attributes to match or rendering will be clipped/misaligned.
- `game.js` looks up DOM elements by ID at load time (`board`, `next-canvas`, `score`, `lines`, `level`, `overlay`, `overlay-title`, `overlay-score`, `restart-btn`) — these IDs are the contract between `index.html` and the script; renaming one requires updating the other.
- User-facing overlay strings are in Spanish (e.g. "GAME OVER", "PAUSA", "Puntuación").
