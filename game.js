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
const recordsBtn = document.getElementById('records-btn');
const startScreen = document.getElementById('start-screen');
const startHighscoresList = document.getElementById('start-highscores-list');
const startStatsEl = document.getElementById('start-stats');
const startPlayBtn = document.getElementById('start-play-btn');
const startResetBtn = document.getElementById('start-reset-btn');
const overlayNameForm = document.getElementById('overlay-name-form');
const overlayNameInput = document.getElementById('overlay-name-input');
const overlayHighscoresSection = document.getElementById('overlay-highscores-section');
const overlayHighscoresList = document.getElementById('overlay-highscores-list');
const overlayStatsEl = document.getElementById('overlay-stats');
const overlayResetBtn = document.getElementById('overlay-reset-btn');

const GRID_LINE_COLORS = { dark: '#22222e', light: '#d8dae8' };

// ---- High scores / records persistence ----
const RECORDS_KEY = 'tetris-records';
const MAX_RECORDS = 5;

function loadRecords() {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (!raw) return { scores: [], bestCombo: 0, maxLines: 0 };
    const parsed = JSON.parse(raw);
    const scores = Array.isArray(parsed.scores)
      ? parsed.scores.filter(e => e && typeof e.name === 'string' && Number.isFinite(e.score))
      : [];
    return {
      scores: scores.slice(0, MAX_RECORDS),
      bestCombo: Number.isFinite(parsed.bestCombo) ? parsed.bestCombo : 0,
      maxLines: Number.isFinite(parsed.maxLines) ? parsed.maxLines : 0,
    };
  } catch (e) {
    return { scores: [], bestCombo: 0, maxLines: 0 };
  }
}

function saveRecords() {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch (e) {
    // storage unavailable/full — ignore, records simply won't persist
  }
}

let records = loadRecords();

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, combo;
let gridLineColor = GRID_LINE_COLORS.dark;

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
    // Combo = consecutive locks (across the whole game) that clear at least
    // one line; it resets to 0 the moment a piece locks without clearing.
    combo++;
    if (combo > records.bestCombo) {
      records.bestCombo = combo;
      saveRecords();
    }
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  } else {
    combo = 0;
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

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
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
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
  nextNameEl.textContent = PIECE_NAMES[next.type] || '';
}

// "Líneas máximas" = the most lines cleared within a single game (not a
// cumulative total across every game ever played).
function qualifiesForTopScores(s) {
  if (s <= 0) return false;
  if (records.scores.length < MAX_RECORDS) return true;
  const lowest = records.scores.reduce((min, e) => (e.score < min.score ? e : min), records.scores[0]);
  return s > lowest.score;
}

function renderHighScores(listEl, highlightEntry) {
  if (!listEl) return;
  listEl.innerHTML = '';
  if (records.scores.length === 0) {
    const li = document.createElement('li');
    li.className = 'highscore-empty';
    li.textContent = 'Sin récords todavía';
    listEl.appendChild(li);
    return;
  }
  const sorted = [...records.scores].sort((a, b) => b.score - a.score);
  sorted.forEach((entry, i) => {
    const li = document.createElement('li');
    const rank = document.createElement('span');
    rank.textContent = `${i + 1}. ${entry.name}`;
    const value = document.createElement('span');
    value.textContent = entry.score.toLocaleString();
    li.appendChild(rank);
    li.appendChild(value);
    if (highlightEntry && entry === highlightEntry) {
      li.classList.add('highscore-highlight');
    }
    listEl.appendChild(li);
  });
}

function renderStats(el) {
  if (!el) return;
  el.textContent = `Mejor combo: ${records.bestCombo}   ·   Líneas máximas: ${records.maxLines}`;
}

function showNameForm() {
  overlayNameForm.classList.remove('hidden');
  overlayNameInput.value = '';
  overlayNameInput.focus();
}

function hideNameForm() {
  overlayNameForm.classList.add('hidden');
}

function saveScoreEntry(rawName) {
  const name = (rawName || '').trim().slice(0, 12) || 'AAA';
  const entry = { name, score };
  records.scores.push(entry);
  records.scores.sort((a, b) => b.score - a.score);
  records.scores = records.scores.slice(0, MAX_RECORDS);
  saveRecords();
  hideNameForm();
  renderHighScores(overlayHighscoresList, entry);
  renderStats(overlayStatsEl);
}

function resetRecords() {
  records = { scores: [], bestCombo: 0, maxLines: 0 };
  saveRecords();
  renderHighScores(startHighscoresList, null);
  renderStats(startStatsEl);
  if (!overlayHighscoresSection.classList.contains('hidden')) {
    renderHighScores(overlayHighscoresList, null);
    renderStats(overlayStatsEl);
  }
}

function showStartScreen() {
  if (!gameOver) {
    paused = true;
    cancelAnimationFrame(animId);
  }
  renderHighScores(startHighscoresList, null);
  renderStats(startStatsEl);
  startScreen.classList.remove('hidden');
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);

  if (lines > records.maxLines) records.maxLines = lines;
  saveRecords();

  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;

  overlayHighscoresSection.classList.remove('hidden');
  renderHighScores(overlayHighscoresList, null);
  renderStats(overlayStatsEl);
  if (qualifiesForTopScores(score)) {
    showNameForm();
  } else {
    hideNameForm();
  }
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
    hideNameForm();
    overlayHighscoresSection.classList.add('hidden');
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
  combo = 0;
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
  if (!startScreen.classList.contains('hidden')) return;
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

restartBtn.addEventListener('click', () => {
  // If a qualifying score's name form is still open, save it (with the
  // default name if left blank) so restarting never silently discards it.
  if (!overlayNameForm.classList.contains('hidden')) {
    saveScoreEntry(overlayNameInput.value);
  }
  init();
});

overlayNameForm.addEventListener('submit', e => {
  e.preventDefault();
  saveScoreEntry(overlayNameInput.value);
});

overlayResetBtn.addEventListener('click', resetRecords);
startResetBtn.addEventListener('click', resetRecords);

recordsBtn.addEventListener('click', showStartScreen);

startPlayBtn.addEventListener('click', () => {
  startScreen.classList.add('hidden');
  // Resumes the already-initialized game (fresh on first load, or the game
  // in progress if the start screen was reopened via the "Récords" button).
  paused = false;
  lastTime = performance.now();
  loop(lastTime);
});

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

init();
showStartScreen();
