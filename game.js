'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#f44336', // PIEZA 3X3 - red
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // PIEZA 3X3 - hueca
];

// Formas usadas para colisión: para la mayoría de piezas coincide con PIECES,
// pero la PIEZA 3X3 se trata como sólida (sin hueco) a efectos de colisión.
const SOLID_SHAPES = {
  8: [[8,8,8],[8,8,8],[8,8,8]],
};

const PIECE_NAMES = {
  8: 'PIEZA 3X3',
};

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const nextNameEl = document.getElementById('next-name');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');

const GRID_LINE_COLORS = { dark: '#22222e', light: '#d8dae8' };

// ---- Skins (visual themes for how blocks are rendered on canvas) ----
// Orthogonal to the light/dark page theme above: skins only affect how
// falling/locked blocks are painted onto #board / #next-canvas.
// SKINS (defined further below, once the per-skin renderers exist) holds,
// per skin: label, palette (parallel to COLORS), render (per-cell draw
// strategy) and an optional boardBg override.
const SKIN_STORAGE_KEY = 'tetris-skin';
const DEFAULT_SKIN = 'retro';

const NEON_PALETTE = [
  null,
  '#00f5ff', // I
  '#faff00', // O
  '#ff00ff', // T
  '#00ff85', // S
  '#ff2d55', // Z
  '#4d7bff', // J
  '#ff9500', // L
  '#ff0037', // PIEZA 3X3
];

const PASTEL_PALETTE = [
  null,
  '#aee1e6', // I
  '#fff2b2', // O
  '#d9bbe0', // T
  '#c3e8c0', // S
  '#f3b6b6', // Z
  '#c0d9f2', // J
  '#f6d3ad', // L
  '#e8a3a3', // PIEZA 3X3
];

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let gridLineColor = GRID_LINE_COLORS.dark;
let currentSkin = DEFAULT_SKIN;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  const solid = (SOLID_SHAPES[type] || PIECES[type]).map(row => [...row]);
  return { type, shape, solid, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotatedShape = rotateCW(current.shape);
  const rotatedSolid = rotateCW(current.solid);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotatedSolid, current.x + kick, current.y)) {
      current.shape = rotatedShape;
      current.solid = rotatedSolid;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.solid, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.solid, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.solid, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawRoundedRectPath(context, x, y, w, h, r) {
  if (typeof context.roundRect === 'function') {
    context.beginPath();
    context.roundRect(x, y, w, h, r);
    return;
  }
  // Fallback approximation for canvas contexts without roundRect support.
  const rr = Math.min(r, w / 2, h / 2);
  context.beginPath();
  context.moveTo(x + rr, y);
  context.lineTo(x + w - rr, y);
  context.quadraticCurveTo(x + w, y, x + w, y + rr);
  context.lineTo(x + w, y + h - rr);
  context.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  context.lineTo(x + rr, y + h);
  context.quadraticCurveTo(x, y + h, x, y + h - rr);
  context.lineTo(x, y + rr);
  context.quadraticCurveTo(x, y, x + rr, y);
  context.closePath();
}

function drawRetroBlock(context, px, py, size, color) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(px + 1, py + 1, size - 2, 4);
}

function drawNeonBlock(context, px, py, size, color) {
  const inset = 3;
  const w = size - inset * 2;
  context.shadowBlur = 12;
  context.shadowColor = color;
  context.fillStyle = color;
  context.fillRect(px + inset, py + inset, w, w);
  context.shadowBlur = 0;
  context.strokeStyle = color;
  context.lineWidth = 1.5;
  context.strokeRect(px + inset + 0.5, py + inset + 0.5, w - 1, w - 1);
  context.fillStyle = 'rgba(255,255,255,0.25)';
  context.fillRect(px + inset, py + inset, w, 3);
}

function drawPastelBlock(context, px, py, size, color) {
  const inset = 2;
  const w = size - inset * 2;
  context.fillStyle = color;
  drawRoundedRectPath(context, px + inset, py + inset, w, w, 6);
  context.fill();
  context.fillStyle = 'rgba(255,255,255,0.35)';
  drawRoundedRectPath(context, px + inset + 2, py + inset + 2, w - 4, Math.max(2, (w - 4) / 3), 4);
  context.fill();
}

function drawPixelBlock(context, px, py, size, color) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  // repeating checkerboard/dither texture over the block
  const cell = Math.max(2, Math.floor(size / 6));
  context.fillStyle = 'rgba(0,0,0,0.18)';
  let col = 0;
  for (let yy = py + 1; yy < py + size - 1; yy += cell, col++) {
    for (let xx = px + 1, row = col; xx < px + size - 1; xx += cell, row++) {
      if (row % 2 === 0) {
        const w = Math.min(cell, px + size - 1 - xx);
        const h = Math.min(cell, py + size - 1 - yy);
        context.fillRect(xx, yy, w, h);
      }
    }
  }
  context.strokeStyle = 'rgba(0,0,0,0.4)';
  context.lineWidth = 1;
  context.strokeRect(px + 1.5, py + 1.5, size - 3, size - 3);
}

// Consolidated skin config: label (UI text), palette (parallel to COLORS,
// indices 1-8 match PIECES/COLORS), render (per-cell draw strategy) and an
// optional boardBg canvas-fill override (used by neon's dark background).
const SKINS = {
  retro: { label: 'Retro', palette: COLORS, render: drawRetroBlock },
  neon: { label: 'Neón', palette: NEON_PALETTE, render: drawNeonBlock, boardBg: '#05050a' },
  pastel: { label: 'Pastel', palette: PASTEL_PALETTE, render: drawPastelBlock },
  pixel: { label: 'Pixel art', palette: COLORS, render: drawPixelBlock },
};

function getSkin() {
  return SKINS[currentSkin] || SKINS[DEFAULT_SKIN];
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const skin = getSkin();
  const color = skin.palette[colorIndex] || COLORS[colorIndex];
  context.save();
  context.globalAlpha = alpha ?? 1;
  skin.render(context, x * size, y * size, size, color);
  context.restore();
}

function drawGrid() {
  ctx.strokeStyle = gridLineColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const boardBg = getSkin().boardBg;
  if (boardBg) {
    ctx.fillStyle = boardBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const boardBg = getSkin().boardBg;
  if (boardBg) {
    nextCtx.fillStyle = boardBg;
    nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
  }
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
  nextNameEl.textContent = PIECE_NAMES[next.type] || '';
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.solid, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.solid, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.solid, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

function applyTheme(isLight) {
  document.body.classList.toggle('light-theme', isLight);
  themeToggle.checked = isLight;
  gridLineColor = isLight ? GRID_LINE_COLORS.light : GRID_LINE_COLORS.dark;
  if (current) draw();
  if (next) drawNext();
}

themeToggle.addEventListener('change', () => applyTheme(themeToggle.checked));

const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
applyTheme(prefersLight);

function applySkin(skinName) {
  currentSkin = SKINS[skinName] ? skinName : DEFAULT_SKIN;
  if (skinSelect) skinSelect.value = currentSkin;
  try {
    localStorage.setItem(SKIN_STORAGE_KEY, currentSkin);
  } catch (e) {
    // localStorage unavailable (e.g. private mode) — skin just won't persist.
  }
  if (current) draw();
  if (next) drawNext();
}

if (skinSelect) {
  skinSelect.addEventListener('change', () => applySkin(skinSelect.value));
}

let storedSkin = DEFAULT_SKIN;
try {
  storedSkin = localStorage.getItem(SKIN_STORAGE_KEY) || DEFAULT_SKIN;
} catch (e) {
  storedSkin = DEFAULT_SKIN;
}
applySkin(storedSkin);

init();
