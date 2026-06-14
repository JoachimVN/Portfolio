const APP_VERSION = 'v1.5.4';
document.querySelectorAll('.lobby-version').forEach(el => { el.textContent = APP_VERSION; });

const BOARD_SIZE = 9;
const CELL_SIZE  = 54;
const GAP        = 10;
const STEP       = CELL_SIZE + GAP;
const BOARD_TOTAL = BOARD_SIZE * CELL_SIZE + (BOARD_SIZE - 1) * GAP;
const WALLS_PER_PLAYER = 10;

const P1_COLOR       = '#9E4A40';
const P2_COLOR       = '#3E68A8';
const BG_COLOR       = '#0F1117';
const CELL_COLOR     = '#191C2A';
const WALL_USED_COLOR = '#252838';
const P1_STRIP       = 'rgba(158, 74, 64, 0.7)';
const P2_STRIP       = 'rgba(62, 104, 168, 0.7)';

function getBackendUrl() {
    if (['localhost', '127.0.0.1'].includes(location.hostname)) return 'http://localhost:3001';
    if (location.hostname.endsWith('.discordsays.com')) return globalThis.location.origin;
    return 'https://choridor-web-production.up.railway.app';
}
const BACKEND_URL = getBackendUrl();
const SOCKET_PATH = location.hostname.endsWith('.discordsays.com') ? '/api/socket.io' : '/socket.io';

// ─── Audio ────────────────────────────────────────────────────────────────

const sounds = {};
['Move', 'Jump', 'Wall', 'Win', 'Loss', 'Select'].forEach(name => {
    const a = new Audio(`audio/sfx/${name}.wav`);
    a.preload = 'auto';
    sounds[name] = a;
});

let muted = false;

function playSound(name) {
    if (muted) return;
    const s = sounds[name];
    if (!s) return;
    s.currentTime = 0;
    s.play().catch(() => {});
}

// ─── Game state ───────────────────────────────────────────────────────────

let gameState = {
    p1Pawn:        { row: 8, col: 4 },
    p2Pawn:        { row: 0, col: 4 },
    walls:         new Set(),
    wallOwners:    new Map(),
    wallCounts:    { p1: WALLS_PER_PLAYER, p2: WALLS_PER_PLAYER },
    currentPlayer: 'p1',
    legalMoves:    [],
    flipped:       false,
    gameOver:      false,
    movesP1:       0,
    movesP2:       0,
};

// ─── Hover state ──────────────────────────────────────────────────────────

let hoverState = { wallRow: null, wallCol: null, wallOrientation: null, moveRow: null, moveCol: null };

// ─── Tap-to-preview state ─────────────────────────────────────────────────

let tapMode    = false;
let tapPreview     = null;  // { row, col, orientation } | null — wall pending confirm
let tapMovePreview = null;  // { row, col } | null — move pending confirm
let pawnAnims  = [];    // active pawn slide / jump animations
let wallAnims  = [];    // active wall grow-in animations
let _animId    = null;  // shared rAF id driving all board animations
let animEnabled = true;  // master motion toggle (set from storage at init)

const PAWN_MOVE_MS  = 200;
const PAWN_JUMP_MS  = 300;
const WALL_PLACE_MS = 210;

// ─── Control-button animation state ───────────────────────────────────────

let flipAnimating  = false;
let flipIconDeg    = 0;
let newGameIconDeg = 0;

// ─── Online state ─────────────────────────────────────────────────────────

let socket              = null;
let onlineRole          = null;   // 'p1' | 'p2' | null
let onlineMode          = false;
let opponentName        = '';
let opponentAvatar      = '';
let myAvatar            = '';
let rematchState           = 'idle'; // 'idle' | 'waiting' | 'incoming'
let softLobby              = false;  // lobby open but game still alive behind it
let softLobbyRestoreWin    = false;  // win overlay was showing when lobby opened

const isDiscord       = location.hostname.endsWith('.discordsays.com');
let discordInstanceId = null;
let discordSdk        = null;
let matchStartTime    = 0;
let matchRoomCode     = '';
let _presenceTimer    = null;
if (isDiscord) { document.body.classList.add('discord-activity'); document.getElementById('change-mode-btn')?.classList.add('hidden'); }

let spectatorMode  = false;
let spectatorCount = 0;

function setDiscordPresence(activity) {
    if (!discordSdk) return;
    clearTimeout(_presenceTimer);
    _presenceTimer = setTimeout(() => {
        discordSdk.commands.setActivity({ activity }).catch(err => console.warn('setActivity failed:', err));
    }, 500);
}

function isMyTurn() {
    if (spectatorMode) return false;
    return !onlineMode || gameState.currentPlayer === onlineRole;
}

// ─── Canvas setup ─────────────────────────────────────────────────────────

const canvas = document.getElementById('gameBoard');
const ctx    = canvas.getContext('2d');
let boardScale = 1;

function resizeCanvas() {
    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);
    if (size <= 0) return;
    boardScale    = size / BOARD_TOTAL;
    canvas.width  = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width  = size + 'px';
    canvas.style.height = size + 'px';
    ctx.setTransform(boardScale * dpr, 0, 0, boardScale * dpr, 0, 0);
}

// ─── Wall boxes ───────────────────────────────────────────────────────────

function buildWallBoxes() {
    ['p1', 'p2'].forEach(p => {
        const c = document.getElementById(`${p}-walls`);
        c.innerHTML = '';
        for (let i = 0; i < WALLS_PER_PLAYER; i++) {
            const box = document.createElement('div');
            box.className    = 'wall-box active';
            box.style.background = p === 'p1' ? P1_COLOR : P2_COLOR;
            box.id           = `${p}-wall-${i}`;
            c.appendChild(box);
        }
    });
}

// ─── Drawing ──────────────────────────────────────────────────────────────

function drawBoard() {
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, BOARD_TOTAL, BOARD_TOTAL);

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const x = c * STEP, y = r * STEP;
            ctx.fillStyle = CELL_COLOR;
            ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);

            const stripH = 3;
            if (r === 0) {
                ctx.fillStyle = P1_STRIP;
                ctx.fillRect(x, y, CELL_SIZE, stripH);
            } else if (r === BOARD_SIZE - 1) {
                ctx.fillStyle = P2_STRIP;
                ctx.fillRect(x, y + CELL_SIZE - stripH, CELL_SIZE, stripH);
            }
        }
    }
}

function drawWalls() {
    const now = performance.now();
    gameState.walls.forEach(wallKey => {
        const wall  = JSON.parse(wallKey);
        const owner = gameState.wallOwners.get(wallKey);
        const color = owner === 'p1' ? P1_COLOR : P2_COLOR;
        const anim  = wallAnims.find(a => a.wallKey === wallKey);

        ctx.save();
        ctx.fillStyle = color;
        if (anim) {
            const p = Math.min((now - anim.t0) / anim.dur, 1);
            ctx.shadowColor = color;
            ctx.shadowBlur  = 10 * (1 - p);          // soft glow flash that fades out
            fillWall(wall.row, wall.col, wall.orientation, easeOutBackSoft(p));
        } else {
            fillWall(wall.row, wall.col, wall.orientation);
        }
        ctx.restore();
    });
}

function drawLegalMoves() {
    if (!isMyTurn()) return;
    const color = gameState.currentPlayer === 'p1' ? P1_COLOR : P2_COLOR;

    gameState.legalMoves.forEach(move => {
        const bx = move.col * STEP, by = move.row * STEP;
        const cx = bx + CELL_SIZE / 2, cy = by + CELL_SIZE / 2;
        const isHovered  = hoverState.moveRow === move.row && hoverState.moveCol === move.col;
        const isSelected = tapMovePreview && tapMovePreview.row === move.row && tapMovePreview.col === move.col;

        ctx.fillStyle = color;
        if (isSelected) {
            ctx.globalAlpha = 0.2;
            ctx.fillRect(bx, by, CELL_SIZE, CELL_SIZE);
            ctx.globalAlpha = 1;
            ctx.beginPath();
            ctx.arc(cx, cy, CELL_SIZE * 0.21, 0, Math.PI * 2);
            ctx.fill();
        } else if (isHovered) {
            ctx.globalAlpha = 0.12;
            ctx.fillRect(bx, by, CELL_SIZE, CELL_SIZE);
            ctx.globalAlpha = 0.85;
            ctx.beginPath();
            ctx.arc(cx, cy, CELL_SIZE * 0.18, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.arc(cx, cy, CELL_SIZE * 0.13, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    ctx.globalAlpha = 1;
}

function drawPawns() {
    const radius = (CELL_SIZE - 2 * CELL_SIZE * 0.16) / 2;
    const now    = performance.now();
    const up     = gameState.flipped ? 1 : -1;   // keep the hop visually upward

    [['p1', gameState.p1Pawn, P1_COLOR], ['p2', gameState.p2Pawn, P2_COLOR]].forEach(([who, pawn, color]) => {
        let cx = pawn.col * STEP + CELL_SIZE / 2;
        let cy = pawn.row * STEP + CELL_SIZE / 2;
        let r  = radius;
        let glow = 0;

        const a = pawnAnims.find(an => an.player === who);
        if (a) {
            const p = Math.min((now - a.t0) / a.dur, 1);
            const e = easeInOutCubic(p);
            const fx = a.fromCol * STEP + CELL_SIZE / 2;
            const fy = a.fromRow * STEP + CELL_SIZE / 2;
            const tx = a.toCol * STEP + CELL_SIZE / 2;
            const ty = a.toRow * STEP + CELL_SIZE / 2;
            cx = fx + (tx - fx) * e;
            cy = fy + (ty - fy) * e;
            const hop = Math.sin(Math.PI * p);
            if (a.isJump) { cy += up * hop * CELL_SIZE * 0.36; r = radius * (1 + hop * 0.08); }
            else          { r = radius * (1 + hop * 0.03); }
            glow = hop;
        }

        ctx.save();
        if (glow > 0) { ctx.shadowColor = color; ctx.shadowBlur = 6 * glow; }
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });
}

function easeOutBack(t) {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// Gentler overshoot for placements that should feel calm, not bouncy
function easeOutBackSoft(t) {
    const c1 = 0.9, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// Would placing this wall still leave both pawns a path to their goal?
function wallKeepsPathsOpen(wallKey) {
    const saved = gameState.walls;
    gameState.walls = new Set(saved);
    gameState.walls.add(wallKey);
    const ok = bothPlayersHavePath();
    gameState.walls = saved;
    return ok;
}

// Fill a wall rect, optionally scaled from its centre (grow ∈ [0,1])
function fillWall(row, col, orientation, grow = 1) {
    const x = col * STEP, y = row * STEP;
    const span = CELL_SIZE * 2 + GAP;
    if (orientation === 'H') {
        const w = span * grow;
        ctx.fillRect(x + (span - w) / 2, y + CELL_SIZE, w, GAP);
    } else {
        const h = span * grow;
        ctx.fillRect(x + CELL_SIZE, y + (span - h) / 2, GAP, h);
    }
}

function canPreviewWall() {
    if (!isMyTurn() || gameState.gameOver) return false;
    const cp = gameState.currentPlayer;
    if (cp === 'p1' && gameState.wallCounts.p1 === 0) return false;
    if (cp === 'p2' && gameState.wallCounts.p2 === 0) return false;
    return true;
}

// Tap-mode locked preview — grows in, then breathes with a soft glow
function drawTapPreview(color) {
    const { row, col, orientation, t0 } = tapPreview;
    const wallKey = JSON.stringify({ row, col, orientation });
    if (gameState.walls.has(wallKey) || hasWallOverlap(row, col, orientation)) return;

    const now  = performance.now();
    const grow = animEnabled ? easeOutBack(Math.min((now - t0) / 240, 1)) : 1;
    const wave = animEnabled ? Math.sin(now * 0.005) : 0;

    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur  = 10 + wave * 4;
    ctx.fillStyle   = color;
    ctx.globalAlpha = 0.66 + wave * 0.14;
    fillWall(row, col, orientation, grow);
    ctx.restore();
}

// Hover preview — faint while valid, fainter when the wall would be illegal
function drawHoverPreview(color) {
    if (hoverState.wallRow === null) return;
    const { wallRow: row, wallCol: col, wallOrientation: orientation } = hoverState;
    const wallKey = JSON.stringify({ row, col, orientation });
    if (gameState.walls.has(wallKey) || hasWallOverlap(row, col, orientation)) return;

    ctx.save();
    ctx.fillStyle   = color;
    ctx.globalAlpha = wallKeepsPathsOpen(wallKey) ? 0.45 : 0.15;
    fillWall(row, col, orientation);
    ctx.restore();
}

function drawWallPreview() {
    if (!canPreviewWall()) return;
    const color = gameState.currentPlayer === 'p1' ? P1_COLOR : P2_COLOR;
    if (!tapPreview) { drawHoverPreview(color); return; }

    drawTapPreview(color);
    // While a wall is locked, still show a faint hover preview on other slots
    const onLocked = hoverState.wallRow === tapPreview.row &&
                     hoverState.wallCol === tapPreview.col &&
                     hoverState.wallOrientation === tapPreview.orientation;
    if (hoverState.wallRow !== null && !onLocked) drawHoverPreview(color);
}

function render() {
    if (gameState.flipped) {
        ctx.save();
        ctx.translate(BOARD_TOTAL, BOARD_TOTAL);
        ctx.scale(-1, -1);
    }
    drawBoard();
    drawWalls();
    drawWallPreview();
    drawLegalMoves();
    drawPawns();
    if (gameState.flipped) ctx.restore();
}

// ─── Legal moves ──────────────────────────────────────────────────────────

function updateLegalMoves() {
    gameState.legalMoves = [];
    const pawn = gameState.currentPlayer === 'p1' ? gameState.p1Pawn : gameState.p2Pawn;
    const opp  = gameState.currentPlayer === 'p1' ? gameState.p2Pawn : gameState.p1Pawn;

    [{ row: -1, col: 0 }, { row: 1, col: 0 }, { row: 0, col: -1 }, { row: 0, col: 1 }].forEach(dir => {
        const neighbor = { row: pawn.row + dir.row, col: pawn.col + dir.col };
        if (neighbor.row < 0 || neighbor.row >= BOARD_SIZE || neighbor.col < 0 || neighbor.col >= BOARD_SIZE) return;
        if (isEdgeBlocked(pawn, neighbor)) return;

        if (!isSamePos(neighbor, opp)) {
            gameState.legalMoves.push(neighbor);
            return;
        }

        const straight = { row: neighbor.row + dir.row, col: neighbor.col + dir.col };
        if (straight.row >= 0 && straight.row < BOARD_SIZE && straight.col >= 0 && straight.col < BOARD_SIZE &&
            !isEdgeBlocked(neighbor, straight)) {
            gameState.legalMoves.push(straight);
        } else {
            [{ row: dir.col, col: -dir.row }, { row: -dir.col, col: dir.row }].forEach(perp => {
                const diag = { row: neighbor.row + perp.row, col: neighbor.col + perp.col };
                if (diag.row >= 0 && diag.row < BOARD_SIZE && diag.col >= 0 && diag.col < BOARD_SIZE &&
                    !isEdgeBlocked(neighbor, diag)) {
                    gameState.legalMoves.push(diag);
                }
            });
        }
    });
    if (tapMovePreview && !gameState.legalMoves.some(m => m.row === tapMovePreview.row && m.col === tapMovePreview.col)) {
        tapMovePreview = null;
        updateTapHint();
    }
    render();
}

function isSamePos(a, b) { return a.row === b.row && a.col === b.col; }

function isEdgeBlocked(from, to) {
    const dr = to.row - from.row, dc = to.col - from.col;
    if (Math.abs(dr) + Math.abs(dc) !== 1) return false;
    if (dc === 0) {
        const edgeRow = Math.min(from.row, to.row);
        return hasWall('H', edgeRow, from.col) || hasWall('H', edgeRow, from.col - 1);
    }
    const edgeCol = Math.min(from.col, to.col);
    return hasWall('V', from.row, edgeCol) || hasWall('V', from.row - 1, edgeCol);
}

function hasWall(orientation, row, col) {
    return gameState.walls.has(JSON.stringify({ row, col, orientation }));
}

// ─── Click handling ───────────────────────────────────────────────────────

canvas.addEventListener('click', e => {
    if (gameState.gameOver || !isMyTurn() || flipAnimating) return;
    const rect = canvas.getBoundingClientRect();
    let x = (e.clientX - rect.left) / boardScale;
    let y = (e.clientY - rect.top)  / boardScale;
    if (gameState.flipped) { x = BOARD_TOTAL - x; y = BOARD_TOTAL - y; }

    const cellX = Math.floor(x / STEP), cellY = Math.floor(y / STEP);
    const offX  = x - cellX * STEP,     offY  = y - cellY * STEP;
    const inHGap = offY >= CELL_SIZE && cellY < BOARD_SIZE - 1;
    const inVGap = offX >= CELL_SIZE && cellX < BOARD_SIZE - 1;

    if (!inHGap && !inVGap) {
        if (tapMode) {
            handleTapMove(cellY, cellX);
        } else {
            clearTapPreview();
            movePawn(cellY, cellX);
        }
    } else if (tapMode) {
        handleTapWall(cellY, cellX, inHGap ? 'H' : 'V');
    } else {
        placeWall(cellY, cellX, inHGap ? 'H' : 'V');
    }
});

function handleTapWall(row, col, orientation) {
    const cp = gameState.currentPlayer;
    if (cp === 'p1' && gameState.wallCounts.p1 === 0) return;
    if (cp === 'p2' && gameState.wallCounts.p2 === 0) return;

    const wallKey = JSON.stringify({ row, col, orientation });
    if (gameState.walls.has(wallKey) || hasWallOverlap(row, col, orientation)) return;
    if (!wallKeepsPathsOpen(wallKey)) return;
    tapMovePreview = null;
    tapPreview = { row, col, orientation, t0: performance.now() };
    playSound('Select');
    if (animEnabled) ensureAnimLoop(); else render();
    updateTapHint();
}

function handleTapMove(row, col) {
    if (!gameState.legalMoves.some(m => m.row === row && m.col === col)) {
        if (tapMovePreview || tapPreview) clearTapPreview();
        return;
    }
    tapPreview = null;
    tapMovePreview = { row, col };
    playSound('Select');
    updateTapHint();
    render();
}

function computeHoverState(cellX, cellY, inHGap, inVGap) {
    const empty = { wallRow: null, wallCol: null, wallOrientation: null, moveRow: null, moveCol: null };
    if (!isMyTurn() || gameState.gameOver) return empty;
    if (!inHGap && !inVGap) {
        const move = gameState.legalMoves.find(m => m.row === cellY && m.col === cellX);
        return { ...empty, moveRow: move?.row ?? null, moveCol: move?.col ?? null };
    }
    return { ...empty, wallRow: cellY, wallCol: cellX, wallOrientation: inHGap ? 'H' : 'V' };
}

canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    let x = (e.clientX - rect.left) / boardScale;
    let y = (e.clientY - rect.top)  / boardScale;
    if (gameState.flipped) { x = BOARD_TOTAL - x; y = BOARD_TOTAL - y; }

    const cellX = Math.floor(x / STEP), cellY = Math.floor(y / STEP);
    const offX  = x - cellX * STEP,     offY  = y - cellY * STEP;
    const inHGap = offY >= CELL_SIZE && cellY < BOARD_SIZE - 1;
    const inVGap = offX >= CELL_SIZE && cellX < BOARD_SIZE - 1;

    const prev = JSON.stringify(hoverState);
    hoverState = computeHoverState(cellX, cellY, inHGap, inVGap);

    let pointer = false;
    if (hoverState.moveRow !== null) {
        pointer = true;
    } else if (hoverState.wallRow !== null) {
        const cp = gameState.currentPlayer;
        const hasWalls = cp === 'p1' ? gameState.wallCounts.p1 > 0 : gameState.wallCounts.p2 > 0;
        const { wallRow: wr, wallCol: wc, wallOrientation: wo } = hoverState;
        const wk = JSON.stringify({ row: wr, col: wc, orientation: wo });
        if (hasWalls && !gameState.walls.has(wk) && !hasWallOverlap(wr, wc, wo)) {
            pointer = wallKeepsPathsOpen(wk);
        }
    }
    canvas.style.cursor = pointer ? 'pointer' : 'default';
    if (JSON.stringify(hoverState) !== prev) render();
});

canvas.addEventListener('mouseleave', () => {
    hoverState = { wallRow: null, wallCol: null, wallOrientation: null, moveRow: null, moveCol: null };
    canvas.style.cursor = 'default';
    render();
});

// ─── Tap-to-preview helpers ───────────────────────────────────────────────

function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Prune finished animations; report whether anything still needs frames
function boardAnimActive() {
    const now = performance.now();
    pawnAnims = pawnAnims.filter(a => now - a.t0 < a.dur);
    wallAnims = wallAnims.filter(a => now - a.t0 < a.dur);
    return Boolean(tapPreview) || pawnAnims.length > 0 || wallAnims.length > 0;
}

// Single rAF loop shared by the tap-preview, pawn moves and wall placements
function ensureAnimLoop() {
    if (_animId) return;
    const tick = () => {
        render();
        _animId = boardAnimActive() ? requestAnimationFrame(tick) : null;
    };
    _animId = requestAnimationFrame(tick);
}

function startPawnAnim(player, from, to, isJump) {
    if (!animEnabled) return;   // state is already updated; a normal render shows it
    pawnAnims = pawnAnims.filter(a => a.player !== player);
    pawnAnims.push({
        player, isJump,
        fromRow: from.row, fromCol: from.col,
        toRow: to.row, toCol: to.col,
        t0: performance.now(), dur: isJump ? PAWN_JUMP_MS : PAWN_MOVE_MS
    });
    ensureAnimLoop();
}

function startWallAnim(wallKey) {
    if (!animEnabled) return;
    wallAnims.push({ wallKey, t0: performance.now(), dur: WALL_PLACE_MS });
    ensureAnimLoop();
}

function clearTapPreview() {
    tapPreview = null;
    tapMovePreview = null;
    updateTapHint();
    render();
}

function updateTapHint() {
    const hint = document.getElementById('tap-confirm-hint');
    if (!hint) return;
    const show = (tapPreview || tapMovePreview) && tapMode && !gameState.gameOver && isMyTurn();
    if (show) {
        hint.className = `tap-confirm-hint ${gameState.currentPlayer} visible`;
        hint.removeAttribute('aria-hidden');
        const label = hint.querySelector('.tap-confirm-label');
        if (label) label.textContent = tapMovePreview ? 'Move here' : 'Place wall';
    } else {
        hint.className = 'tap-confirm-hint';
        hint.setAttribute('aria-hidden', 'true');
    }
}

let _toastTimer = null;
function showToast(msg) {
    const el = document.getElementById('tap-toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('visible');
    el.removeAttribute('aria-hidden');
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => {
        el.classList.remove('visible');
        el.setAttribute('aria-hidden', 'true');
    }, 2600);
}

function setTapMode(enabled) {
    tapMode = enabled;
    localStorage.setItem('choridor_tap_mode', enabled ? '1' : '0');
    const btn = document.getElementById('tap-mode-btn');
    if (btn) {
        btn.classList.toggle('tap-active', enabled);
        btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    }
    if (!enabled) clearTapPreview();
    showToast(enabled ? 'Confirm mode: ON — tap a move or wall, then confirm' : 'Confirm mode: OFF');
    render();
}

const ANIM_ICON_ON = `<path d="M12 3.2l1.7 4.9 4.9 1.7-4.9 1.7L12 16.4l-1.7-4.9L5.4 9.8l4.9-1.7L12 3.2z"/>
                      <path d="M18.5 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z"/>`;
const ANIM_ICON_OFF = ANIM_ICON_ON + `<line x1="3" y1="3" x2="21" y2="21"/>`;

function updateAnimButton(on) {
    const btn  = document.getElementById('anim-btn');
    const icon = document.getElementById('anim-icon');
    if (btn) {
        btn.classList.toggle('anim-off', !on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.setAttribute('aria-label', on ? 'Turn animations off' : 'Turn animations on');
    }
    if (icon) icon.innerHTML = on ? ANIM_ICON_ON : ANIM_ICON_OFF;
}

function stopBoardAnims() {
    pawnAnims = [];
    wallAnims = [];
    if (_animId) { cancelAnimationFrame(_animId); _animId = null; }
}

function setAnimEnabled(on, silent = false) {
    animEnabled = on;
    localStorage.setItem('choridor_anim', on ? '1' : '0');
    updateAnimButton(on);
    if (!on) stopBoardAnims();
    else if (tapPreview) ensureAnimLoop();
    render();
    if (!silent) showToast(on ? 'Animations: ON' : 'Animations: OFF');
}

// ─── Moves ────────────────────────────────────────────────────────────────

// Delay before the win card appears, so the deciding move animates first
function winDelay(isJump) {
    if (!animEnabled) return 0;
    return isJump ? PAWN_JUMP_MS : PAWN_MOVE_MS;
}

function movePawn(row, col) {
    if (gameState.gameOver) return;
    if (!gameState.legalMoves.some(m => m.row === row && m.col === col)) return;

    const mover  = gameState.currentPlayer;
    const from   = mover === 'p1' ? { ...gameState.p1Pawn } : { ...gameState.p2Pawn };
    const isJump = Math.abs(row - from.row) + Math.abs(col - from.col) > 1;

    if (mover === 'p1') { gameState.p1Pawn = { row, col }; gameState.movesP1++; }
    else                { gameState.p2Pawn = { row, col }; gameState.movesP2++; }

    playSound(isJump ? 'Jump' : 'Move');
    if (socket && onlineMode) socket.emit('move', { type: 'pawn', row, col });
    startPawnAnim(mover, from, { row, col }, isJump);
    if (checkWin(winDelay(isJump))) return;
    gameState.currentPlayer = mover === 'p1' ? 'p2' : 'p1';
    updateStatus();
    updateLegalMoves();
}

// animateBoardWall=false when confirming a previewed wall (it already grew in)
function placeWall(row, col, orientation, animateBoardWall = true) {
    if (gameState.gameOver) return;
    const mover = gameState.currentPlayer;
    if (mover === 'p1' && gameState.wallCounts.p1 === 0) return;
    if (mover === 'p2' && gameState.wallCounts.p2 === 0) return;

    const wallKey = JSON.stringify({ row, col, orientation });
    if (gameState.walls.has(wallKey) || hasWallOverlap(row, col, orientation)) return;

    gameState.walls.add(wallKey);
    if (!bothPlayersHavePath()) { gameState.walls.delete(wallKey); return; }

    gameState.wallOwners.set(wallKey, mover);
    if (mover === 'p1') { gameState.wallCounts.p1--; gameState.movesP1++; }
    else                { gameState.wallCounts.p2--; gameState.movesP2++; }

    playSound('Wall');
    if (socket && onlineMode) socket.emit('move', { type: 'wall', row, col, orientation });
    if (animateBoardWall) startWallAnim(wallKey);
    animateWallSpend(mover);
    gameState.currentPlayer = mover === 'p1' ? 'p2' : 'p1';
    updateWallCounts();
    updateStatus();
    updateLegalMoves();
}

function applyOpponentPawnMove(data) {
    const mover  = gameState.currentPlayer;
    const from   = mover === 'p1' ? { ...gameState.p1Pawn } : { ...gameState.p2Pawn };
    const isJump = Math.abs(data.row - from.row) + Math.abs(data.col - from.col) > 1;
    if (mover === 'p1') { gameState.p1Pawn = { row: data.row, col: data.col }; gameState.movesP1++; }
    else                { gameState.p2Pawn = { row: data.row, col: data.col }; gameState.movesP2++; }
    playSound(isJump ? 'Jump' : 'Move');
    startPawnAnim(mover, from, { row: data.row, col: data.col }, isJump);
    if (checkWin(winDelay(isJump))) return;
    gameState.currentPlayer = mover === 'p1' ? 'p2' : 'p1';
    updateStatus();
    updateLegalMoves();
}

function applyOpponentWallMove(data) {
    const mover   = gameState.currentPlayer;
    const wallKey = JSON.stringify({ row: data.row, col: data.col, orientation: data.orientation });
    gameState.walls.add(wallKey);
    gameState.wallOwners.set(wallKey, mover);
    if (mover === 'p1') { gameState.wallCounts.p1--; gameState.movesP1++; }
    else                { gameState.wallCounts.p2--; gameState.movesP2++; }
    playSound('Wall');
    startWallAnim(wallKey);
    animateWallSpend(mover);
    gameState.currentPlayer = mover === 'p1' ? 'p2' : 'p1';
    updateWallCounts();
    updateStatus();
    updateLegalMoves();
}

function applyOpponentMove(data) {
    if (data.type === 'pawn') applyOpponentPawnMove(data);
    else if (data.type === 'wall') applyOpponentWallMove(data);
}

function hasWallOverlap(row, col, orientation) {
    const MAX = BOARD_SIZE - 2;
    if (row < 0 || row > MAX || col < 0 || col > MAX) return true;
    if (orientation === 'H') {
        return hasWall('H', row, col - 1) || hasWall('H', row, col + 1) || hasWall('V', row, col);
    }
    return hasWall('V', row - 1, col) || hasWall('V', row + 1, col) || hasWall('H', row, col);
}

function bothPlayersHavePath() {
    return hasPathToGoal(gameState.p1Pawn, 0) && hasPathToGoal(gameState.p2Pawn, BOARD_SIZE - 1);
}

function hasPathToGoal(start, goalRow) {
    const visited = new Set([`${start.row},${start.col}`]);
    const queue   = [start];
    while (queue.length) {
        const pos = queue.shift();
        if (pos.row === goalRow) return true;
        for (const dir of [{ row: -1, col: 0 }, { row: 1, col: 0 }, { row: 0, col: -1 }, { row: 0, col: 1 }]) {
            const next = { row: pos.row + dir.row, col: pos.col + dir.col };
            const key  = `${next.row},${next.col}`;
            if (next.row >= 0 && next.row < BOARD_SIZE && next.col >= 0 && next.col < BOARD_SIZE &&
                !visited.has(key) && !isEdgeBlocked(pos, next)) {
                visited.add(key);
                queue.push(next);
            }
        }
    }
    return false;
}

// ─── UI updates ───────────────────────────────────────────────────────────

function updateWallCounts() {
    ['p1', 'p2'].forEach(p => {
        for (let i = 0; i < WALLS_PER_PLAYER; i++) {
            const box = document.getElementById(`${p}-wall-${i}`);
            if (box.classList.contains('spending')) continue;   // let the animation own it
            if (i < gameState.wallCounts[p]) {
                box.className = 'wall-box active';
                box.style.background = p === 'p1' ? P1_COLOR : P2_COLOR;
            } else {
                box.className = 'wall-box used';
                box.style.background = WALL_USED_COLOR;
            }
        }
    });
}

// Animate the just-spent wall box (call after the count has been decremented)
function animateWallSpend(player) {
    if (!animEnabled) return;   // updateWallCounts will flip it to "used" instantly
    const idx = gameState.wallCounts[player];   // the box that just flipped to "used"
    const box = document.getElementById(`${player}-wall-${idx}`);
    if (!box) return;
    box.classList.remove('used');
    box.classList.add('spending');
    box.style.background = player === 'p1' ? P1_COLOR : P2_COLOR;
    box.addEventListener('animationend', () => {
        box.classList.remove('spending');
        box.className = 'wall-box used';
        box.style.background = WALL_USED_COLOR;
    }, { once: true });
}

function updateInMatchPresence(myTurn) {
    if (!isDiscord || gameState.gameOver) return;
    const oppLabel = opponentName || 'Opponent';
    setDiscordPresence({
        details: `vs. ${oppLabel}`,
        state: myTurn ? `${getMyName()}'s turn` : `${oppLabel}'s turn`,
        timestamps: { start: matchStartTime },
        assets: { large_image: 'embedded_background', large_text: 'CHORIDOR', small_image: 'choridor_icon', small_text: 'CHORIDOR' },
        party: { id: matchRoomCode || discordInstanceId, size: [2, 2] },
        instance: true,
    });
}

function updateStatus() {
    const status = document.getElementById('status');
    if (onlineMode) {
        const myTurn = isMyTurn();
        const opp = opponentName;
        const apostrophe = opp.endsWith('s') ? "'" : "'s";
        const oppTurn = opp ? `${opp}${apostrophe} turn` : "Opponent's turn";
        status.textContent = myTurn ? 'Your turn' : oppTurn;
        status.className   = `status-label ${gameState.currentPlayer}`;
        updateInMatchPresence(myTurn);
    } else {
        const name = gameState.currentPlayer === 'p1'
            ? document.getElementById('p1-name').textContent
            : document.getElementById('p2-name').textContent;
        status.textContent = `${name}'s Turn`;
        status.className   = `status-label ${gameState.currentPlayer}`;
    }
    updateTapHint();
}

function checkWin(delay = 0) {
    if (gameState.p1Pawn.row === 0) {
        showWinScreen(document.getElementById('p1-name').textContent, 'p1', delay);
        return true;
    }
    if (gameState.p2Pawn.row === BOARD_SIZE - 1) {
        showWinScreen(document.getElementById('p2-name').textContent, 'p2', delay);
        return true;
    }
    return false;
}

function populateWinStats() {
    document.getElementById('win-stat-p1-name').textContent = document.getElementById('p1-name').textContent;
    document.getElementById('win-stat-p2-name').textContent = document.getElementById('p2-name').textContent;

    ['p1', 'p2'].forEach(p => {
        const m = gameState[p === 'p1' ? 'movesP1' : 'movesP2'];
        const el = document.getElementById(`win-stat-${p}-moves`);
        el.innerHTML = `<strong>${m}</strong>move${m === 1 ? '' : 's'}`;

        const container = document.getElementById(`win-stat-${p}-walls`);
        container.innerHTML = '';
        const remaining = gameState.wallCounts[p];
        for (let i = 0; i < WALLS_PER_PLAYER; i++) {
            const box = document.createElement('div');
            box.className = `win-wall-mini ${i < remaining ? 'active' : 'used'}`;
            if (i < remaining) box.style.background = p === 'p1' ? P1_COLOR : P2_COLOR;
            container.appendChild(box);
        }
    });
}

function showWinScreen(winner, playerClass, delay = 0) {
    clearTapPreview();
    gameState.gameOver = true;   // lock input now; reveal the card after the move lands
    if (isDiscord && onlineMode) {
        setDiscordPresence({
            details: `vs. ${opponentName || 'Opponent'}`,
            state: `${winner} wins!`,
            assets: { large_image: 'embedded_background', large_text: 'CHORIDOR', small_image: 'choridor_icon', small_text: 'CHORIDOR' },
            party: { id: matchRoomCode || discordInstanceId, size: [2, 2] },
        });
    }
    document.getElementById('win-card').className  = `win-card ${playerClass}`;
    document.getElementById('win-pawn').className  = `win-pawn ${playerClass}`;
    const msg = document.getElementById('win-message');
    msg.textContent = `${winner} Wins!`;
    msg.className   = `win-title ${playerClass}`;

    document.getElementById('play-again-btn').classList.toggle('hidden', onlineMode || spectatorMode);
    document.getElementById('btn-rematch').classList.toggle('hidden', !onlineMode || spectatorMode);
    document.getElementById('btn-change-mode').classList.toggle('hidden', !onlineMode || spectatorMode || isDiscord);
    if (onlineMode) updateRematchBtn('idle');
    populateWinStats();

    const reveal = () => {
        playSound('Win');
        document.getElementById('win-footer').classList.add('hidden');
        const card = document.getElementById('win-card');
        card.style.animation = 'none';
        card.getBoundingClientRect();
        card.style.animation = '';
        document.getElementById('win-overlay').classList.remove('hidden');
    };
    if (delay) setTimeout(reveal, delay);
    else       reveal();
}

function resetGame() {
    clearTapPreview();
    pawnAnims = [];
    wallAnims = [];
    gameState = {
        p1Pawn:        { row: 8, col: 4 },
        p2Pawn:        { row: 0, col: 4 },
        walls:         new Set(),
        wallOwners:    new Map(),
        wallCounts:    { p1: WALLS_PER_PLAYER, p2: WALLS_PER_PLAYER },
        currentPlayer: 'p1',
        legalMoves:    [],
        flipped:       onlineMode ? onlineRole === 'p2' : gameState.flipped,
        gameOver:      false,
        movesP1:       0,
        movesP2:       0,
    };
    document.getElementById('win-overlay').classList.add('hidden');
    document.getElementById('win-footer').classList.add('hidden');
    updateWallCounts();
    updateStatus();
    updateLegalMoves();
}

// ─── Online: socket setup ─────────────────────────────────────────────────

function initSocket(errorElId, callback) {
    if (socket?.connected) { callback(); return; }
    if (socket) { socket.disconnect(); socket = null; }

    try {
        socket = io(BACKEND_URL, { path: SOCKET_PATH, transports: ['websocket', 'polling'] });
    } catch (err) {
        clearConnectingBtn();
        showLobbyError(errorElId, `Failed to init socket: ${err.message}`);
        return;
    }

    const connInfo = `${BACKEND_URL}${SOCKET_PATH}`;

    const timeout = setTimeout(() => {
        if (!socket?.connected) {
            clearConnectingBtn();
            showLobbyError(errorElId, `Timed out connecting to ${connInfo}`);
            socket?.disconnect();
            socket = null;
        }
    }, 4000);

    socket.once('connect', () => {
        clearTimeout(timeout);
        clearConnectingBtn();
        callback();
    });

    socket.on('connect_error', err => {
        clearTimeout(timeout);
        clearConnectingBtn();
        showLobbyError(errorElId, `${err?.message || 'Connection failed'}: ${connInfo}`);
        socket?.disconnect();
        socket = null;
    });

    socket.on('room-created', ({ code }) => {
        onlineRole = 'p1';
        document.getElementById('room-code-display').textContent = code;
        showLobbyView('lview-waiting');
    });

    socket.on('room-joined', () => { onlineRole = 'p2'; });

    socket.on('game-start', ({ p1Name, p2Name, p1Avatar, p2Avatar, role, code } = {}) => {
        if (role) onlineRole = role;
        opponentName   = onlineRole === 'p1' ? (p2Name   || '') : (p1Name   || '');
        opponentAvatar = onlineRole === 'p1' ? (p2Avatar || '') : (p1Avatar || '');
        matchStartTime = Math.floor(Date.now() / 1000);
        matchRoomCode  = code || '';
        onlineMode = true;
        hideLobby();
        applyPlayerNames();
        resetGame();
    });

    socket.on('opponent-move', data => applyOpponentMove(data));

    socket.on('room-error', msg => showLobbyError(errorElId, msg));

    socket.on('opponent-left', () => {
        // Keep onlineMode=true so New Game/Change Mode still route to the lobby
        opponentName   = '';
        opponentAvatar = '';
        if (isDiscord) setDiscordPresence({ state: 'In lobby', assets: { large_image: 'embedded_cover', large_text: 'CHORIDOR', small_image: 'choridor_icon', small_text: 'CHORIDOR' } });
        gameState.gameOver = true;
        hoverState = { wallRow: null, wallCol: null, wallOrientation: null, moveRow: null, moveCol: null };
        clearTapPreview();
        render();
        const s = document.getElementById('status');
        s.textContent = 'Opponent disconnected';
        s.className   = 'status-label';
    });

    socket.on('rematch-requested', () => {
        updateRematchBtn('incoming');
        if (softLobby) showToast('Opponent wants a rematch!');
    });
    socket.on('rematch-cancelled', () => updateRematchBtn('idle'));

    socket.on('rematch-start', ({ p1Name, p2Name, p1Avatar, p2Avatar } = {}) => {
        if (spectatorMode) {
            document.getElementById('p1-name').textContent = p1Name || 'Player 1';
            document.getElementById('p2-name').textContent = p2Name || 'Player 2';
            setPlayerAvatar('p1', p1Avatar);
            setPlayerAvatar('p2', p2Avatar);
            resetGame();
            updateStatus();
            updateLegalMoves();
            return;
        }
        onlineRole     = onlineRole === 'p1' ? 'p2' : 'p1';
        opponentName   = onlineRole === 'p1' ? (p2Name   || '') : (p1Name   || '');
        opponentAvatar = onlineRole === 'p1' ? (p2Avatar || '') : (p1Avatar || '');
        matchStartTime = Math.floor(Date.now() / 1000);
        if (softLobby) {
            softLobby = false; softLobbyRestoreWin = false;
            document.getElementById('lobby-overlay').classList.add('hidden');
            document.getElementById('btn-lobby-back').classList.add('hidden');
        }
        applyPlayerNames();
        resetGame();
    });

    socket.on('spectate-start', ({ p1Name, p2Name, p1Avatar, p2Avatar, snapshot, queuePosition, spectatorCount: sc } = {}) => {
        spectatorMode  = true;
        onlineMode     = false;
        spectatorCount = sc || 1;
        document.getElementById('p1-name').textContent = p1Name || 'Player 1';
        document.getElementById('p2-name').textContent = p2Name || 'Player 2';
        setPlayerAvatar('p1', p1Avatar || '');
        setPlayerAvatar('p2', p2Avatar || '');
        resetGame();
        if (snapshot) { applyGameSnapshot(snapshot); updateWallCounts(); }
        hideLobby();
        if (!isDiscord) showToast('Room is full - watching as spectator');
        if (isDiscord) setDiscordPresence({ state: 'Spectating', details: `${p1Name || 'Player 1'} vs. ${p2Name || 'Player 2'}`, assets: { large_image: 'embedded_background', large_text: 'CHORIDOR', small_image: 'choridor_icon', small_text: 'CHORIDOR' } });
        updateSpectatorBanner(queuePosition || 1);
        updateSpectatorCountUI(spectatorCount);
        updateStatus();
        updateLegalMoves();
        render();
    });

    socket.on('spectator-count', count => {
        spectatorCount = count;
        updateSpectatorCountUI(count);
        if (spectatorMode) updateSpectatorBanner(null);
    });

    socket.on('become-player', ({ role, p1Name, p2Name, p1Avatar, p2Avatar } = {}) => {
        spectatorMode  = false;
        onlineRole     = role;
        onlineMode     = true;
        opponentName   = role === 'p1' ? (p2Name || '') : (p1Name || '');
        opponentAvatar = role === 'p1' ? (p2Avatar || '') : (p1Avatar || '');
        matchStartTime = Math.floor(Date.now() / 1000);
        document.getElementById('p1-name').textContent = p1Name || 'Player 1';
        document.getElementById('p2-name').textContent = p2Name || 'Player 2';
        setPlayerAvatar('p1', p1Avatar || '');
        setPlayerAvatar('p2', p2Avatar || '');
        applyPlayerNames();
        gameState.flipped = role === 'p2';
        document.getElementById('win-overlay').classList.add('hidden');
        document.getElementById('win-footer').classList.add('hidden');
        clearTapPreview();
        resetGame();
        updateSpectatorBanner(0);
        updateSpectatorCountUI(spectatorCount);
        updateStatus();
        updateLegalMoves();
        render();
    });

    socket.on('game-surrendered', ({ winnerRole, winnerName } = {}) => {
        if (gameState.gameOver) return;
        showWinScreen(winnerName || (winnerRole === 'p1' ? 'Player 1' : 'Player 2'), winnerRole);
    });

    socket.on('opponent-rejoined', ({ name, avatar } = {}) => {
        opponentName   = name || '';
        opponentAvatar = avatar || '';
        applyPlayerNames();
        document.getElementById('win-overlay').classList.add('hidden');
        document.getElementById('win-footer').classList.add('hidden');
        resetGame();
        updateStatus();
    });
}

// ─── Legal modal ──────────────────────────────────────────────────────────

async function openLegal(url) {
    const modal   = document.getElementById('legal-modal');
    const content = document.getElementById('legal-modal-content');
    content.innerHTML = '<p style="color:#8890A8;padding:20px 0">Loading…</p>';
    modal.classList.remove('hidden');
    try {
        const res = await fetch(url);
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        const card = doc.querySelector('.card');
        card?.querySelector('.back')?.remove();
        content.innerHTML = card?.innerHTML ?? '<p>Content unavailable.</p>';
    } catch {
        content.innerHTML = '<p style="color:#9E4A40">Failed to load content.</p>';
    }
}

function closeLegal() {
    document.getElementById('legal-modal').classList.add('hidden');
}

// ─── Button loading state ─────────────────────────────────────────────────

let _connectingBtnId = null;

function setConnectingBtn(btnId) {
    _connectingBtnId = btnId;
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = true;
    const span = btn.querySelector('span') ?? btn;
    btn.dataset.prevText = span.textContent;
    span.textContent = 'Connecting…';
}

function clearConnectingBtn() {
    if (!_connectingBtnId) return;
    const btn = document.getElementById(_connectingBtnId);
    if (btn) {
        btn.disabled = false;
        const span = btn.querySelector('span') ?? btn;
        span.textContent = btn.dataset.prevText ?? span.textContent;
    }
    _connectingBtnId = null;
}

// ─── Online: lobby UI ─────────────────────────────────────────────────────

function showLobbyView(id) {
    const current = [...document.querySelectorAll('.lobby-view')].find(v => !v.classList.contains('hidden'));
    const next = document.getElementById(id);
    if (current === next) return;

    if (current) {
        current.style.opacity = '0';
        current.style.transform = 'translateY(-6px)';
        current.style.transition = 'opacity 0.13s ease, transform 0.13s ease';
        setTimeout(() => {
            current.classList.add('hidden');
            current.style.cssText = '';
            next.classList.remove('hidden');
            next.classList.add('lobby-view-entering');
            setTimeout(() => next.classList.remove('lobby-view-entering'), 240);
        }, 130);
    } else {
        next.classList.remove('hidden');
        next.classList.add('lobby-view-entering');
        setTimeout(() => next.classList.remove('lobby-view-entering'), 240);
    }
}

function hideLobby() {
    document.getElementById('lobby-overlay').classList.add('hidden');
}

function applyGameSnapshot(snapshot) {
    if (!snapshot) return;
    gameState.p1Pawn        = { ...snapshot.p1Pawn };
    gameState.p2Pawn        = { ...snapshot.p2Pawn };
    gameState.wallCounts    = { ...snapshot.wallCounts };
    gameState.currentPlayer = snapshot.currentPlayer;
    gameState.movesP1       = snapshot.movesP1 || 0;
    gameState.movesP2       = snapshot.movesP2 || 0;
    gameState.gameOver      = false;
    gameState.walls      = new Set();
    gameState.wallOwners = new Map();
    for (const w of (snapshot.walls || [])) {
        const key = JSON.stringify({ row: w.row, col: w.col, orientation: w.orientation });
        gameState.walls.add(key);
        gameState.wallOwners.set(key, w.owner);
    }
}

function updateSpectatorCountUI(count) {
    const chip = document.getElementById('spectator-count');
    const num  = document.getElementById('spectator-count-num');
    if (!chip || !num) return;
    if (count > 0 && (onlineMode || spectatorMode)) {
        chip.classList.remove('hidden');
        num.textContent = count;
    } else {
        chip.classList.add('hidden');
    }
}

function updateSpectatorBanner(queuePosition) {
    const banner   = document.getElementById('spectator-banner');
    const queuePos = document.getElementById('spectator-queue-pos');
    if (!banner) return;
    if (spectatorMode) {
        banner.classList.remove('hidden');
        if (queuePos) queuePos.textContent = queuePosition ? `(#${queuePosition} in queue)` : '';
    } else {
        banner.classList.add('hidden');
    }
}

function showLobbyError(elId, msg) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
}

// ─── Player name ─────────��────────────────────────────────────────────────

const nameInput = document.getElementById('player-name-input');
const savedName = localStorage.getItem('choridor_player_name') || '';
if (nameInput) nameInput.value = savedName;

function getMyName() {
    return localStorage.getItem('choridor_player_name')?.trim() || '';
}

function updateRematchBtn(state) {
    rematchState = state;
    let modifier = '';
    let label    = 'Rematch';
    if (state === 'waiting')  { modifier = ' waiting';  label = 'Waiting…'; }
    if (state === 'incoming') { modifier = ' incoming'; label = 'Accept Rematch!'; }

    const btn = document.getElementById('btn-rematch');
    if (btn) { btn.className = 'win-btn' + modifier; btn.textContent = label; btn.disabled = false; }

    const footer = document.getElementById('win-footer-rematch');
    if (footer) { footer.className = 'win-footer-btn' + modifier; footer.textContent = label; }
}

function setPlayerAvatar(slot, url) {
    const img  = document.getElementById(`${slot}-avatar-img`);
    if (!img || !url) return;
    img.src = url;
    img.classList.remove('hidden');
}

function clearPlayerAvatars() {
    ['p1', 'p2'].forEach(slot => {
        const img = document.getElementById(`${slot}-avatar-img`);
        if (img) { img.src = ''; img.classList.add('hidden'); }
    });
}

function applyPlayerNames() {
    const name = getMyName();
    if (onlineMode) {
        if (onlineRole === 'p1') {
            document.getElementById('p1-name').textContent = name || 'Player 1';
            document.getElementById('p2-name').textContent = opponentName || 'Opponent';
            setPlayerAvatar('p1', myAvatar);
            setPlayerAvatar('p2', opponentAvatar);
        } else {
            document.getElementById('p1-name').textContent = opponentName || 'Opponent';
            document.getElementById('p2-name').textContent = name || 'Player 2';
            setPlayerAvatar('p1', opponentAvatar);
            setPlayerAvatar('p2', myAvatar);
        }
    } else {
        document.getElementById('p1-name').textContent = name || 'Player 1';
        document.getElementById('p2-name').textContent = 'Player 2';
        clearPlayerAvatars();
    }
}

nameInput?.addEventListener('input', () => {
    const val = nameInput.value.trim();
    if (val) localStorage.setItem('choridor_player_name', val);
    else localStorage.removeItem('choridor_player_name');
    if (!onlineMode) applyPlayerNames();
});

const joinNameInput = document.getElementById('join-player-name-input');
if (joinNameInput) {
    joinNameInput.value = savedName;
    joinNameInput.addEventListener('input', () => {
        const val = joinNameInput.value.trim();
        if (val) localStorage.setItem('choridor_player_name', val);
        else localStorage.removeItem('choridor_player_name');
        if (nameInput) nameInput.value = joinNameInput.value;
    });
}

applyPlayerNames();
if (isDiscord) showLobbyView('lview-discord');

document.getElementById('btn-local').addEventListener('click', () => {
    playSound('Select');
    if (softLobby) {
        onlineMode = false; onlineRole = null; opponentName = ''; opponentAvatar = '';
        spectatorMode = false;
        socket?.disconnect(); socket = null;
        softLobby = false; softLobbyRestoreWin = false;
        resetGame();
    }
    applyPlayerNames();
    hideLobby();
});

document.getElementById('btn-online').addEventListener('click', () => {
    playSound('Select');
    showLobbyView('lview-online');
});
document.getElementById('btn-online-back').addEventListener('click', () => {
    playSound('Select');
    showLobbyView('lview-mode');
    if (softLobby) document.getElementById('btn-lobby-back').classList.remove('hidden');
});

document.getElementById('btn-lobby-back').addEventListener('click', () => {
    if (!softLobby) return;
    playSound('Select');
    const restoreWin = softLobbyRestoreWin;
    softLobby = false; softLobbyRestoreWin = false;
    document.getElementById('btn-lobby-back').classList.add('hidden');
    document.getElementById('lobby-overlay').classList.add('hidden');
    if (restoreWin) document.getElementById('win-overlay').classList.remove('hidden');
    // else: game board is already visible behind the lobby
});

document.getElementById('btn-create').addEventListener('click', () => {
    playSound('Select');
    if (softLobby) {
        onlineMode = false; onlineRole = null; opponentName = ''; opponentAvatar = '';
        spectatorMode = false;
        socket?.disconnect(); socket = null;
        softLobby = false; softLobbyRestoreWin = false;
        resetGame();
    }
    setConnectingBtn('btn-create');
    initSocket('create-error', () => socket.emit('create-room', { name: getMyName() }));
});

document.getElementById('btn-join').addEventListener('click', () => { playSound('Select'); showLobbyView('lview-join'); });
document.getElementById('btn-join-back').addEventListener('click', () => { playSound('Select'); showLobbyView('lview-online'); });

document.getElementById('btn-waiting-back').addEventListener('click', () => {
    playSound('Select');
    spectatorMode = false;
    socket?.disconnect(); socket = null;
    showLobbyView('lview-mode');
});

document.getElementById('btn-copy-link').addEventListener('click', () => {
    playSound('Jump');
    const code = document.getElementById('room-code-display').textContent;
    const url  = `${location.origin}${location.pathname}?room=${code}`;
    navigator.clipboard.writeText(url).then(() => {
        const label = document.getElementById('copy-btn-label');
        label.textContent = 'Copied!';
        setTimeout(() => { label.textContent = 'Copy Invite Link'; }, 2000);
    });
});


document.getElementById('win-card-close').addEventListener('click', () => {
    document.getElementById('win-overlay').classList.add('hidden');
    if (onlineMode && !spectatorMode) document.getElementById('win-footer').classList.remove('hidden');
});

document.getElementById('win-footer-rematch').addEventListener('click', () => {
    playSound('Select');
    if (spectatorMode) return;
    if (rematchState === 'idle' || rematchState === 'incoming') {
        socket?.emit('rematch-request');
        updateRematchBtn('waiting');
    } else if (rematchState === 'waiting') {
        socket?.emit('rematch-cancel');
        updateRematchBtn('idle');
    }
});

document.getElementById('btn-rematch')?.addEventListener('click', () => {
    playSound('Select');
    if (rematchState === 'idle' || rematchState === 'incoming') {
        socket?.emit('rematch-request');
        updateRematchBtn('waiting');
    } else if (rematchState === 'waiting') {
        socket?.emit('rematch-cancel');
        updateRematchBtn('idle');
    }
});

function openSoftLobby(fromWin = false) {
    softLobby           = true;
    softLobbyRestoreWin = fromWin;
    document.getElementById('win-overlay').classList.add('hidden');
    document.getElementById('win-footer').classList.add('hidden');
    document.getElementById('lobby-overlay').classList.remove('hidden');
    document.getElementById('btn-lobby-back').classList.remove('hidden');
    showLobbyView(isDiscord ? 'lview-discord' : 'lview-mode');
    applyPlayerNames();
    // Socket and game state stay intact until user picks a new mode
}

document.getElementById('btn-change-mode').addEventListener('click', () => {
    playSound('Select');
    openSoftLobby(true);
});

document.getElementById('win-footer-change-mode').addEventListener('click', () => {
    playSound('Select');
    openSoftLobby(true);
});

document.getElementById('btn-join-confirm').addEventListener('click', () => {
    const code = document.getElementById('room-code-input').value.trim().toUpperCase();
    if (!code) return;
    playSound('Select');
    if (softLobby) {
        onlineMode = false; onlineRole = null; opponentName = ''; opponentAvatar = '';
        spectatorMode = false;
        socket?.disconnect(); socket = null;
        softLobby = false; softLobbyRestoreWin = false;
        resetGame();
    }
    document.getElementById('join-error').classList.add('hidden');
    setConnectingBtn('btn-join-confirm');
    initSocket('join-error', () => socket.emit('join-room', { code, name: getMyName() }));
});

document.getElementById('room-code-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-join-confirm').click();
});

// Auto-join if URL contains ?room=CODE (skip in Discord — uses join-activity instead)
const urlRoom = !isDiscord && new URLSearchParams(location.search).get('room');
if (urlRoom) {
    showLobbyView('lview-join');
    document.getElementById('room-code-input').value = urlRoom.toUpperCase();
}

['btn-tos', 'btn-privacy'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', e => { e.preventDefault(); openLegal(el.href); });
});
document.getElementById('legal-modal-close').addEventListener('click', closeLegal);
document.getElementById('legal-modal-x').addEventListener('click', closeLegal);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLegal(); });

// ─── Buttons ──────────────────────────────────────────────────────────────

document.getElementById('play-again-btn').addEventListener('click', () => {
    playSound('Select');
    if (onlineMode) {
        // In online mode, go back to lobby for a new game
        onlineMode = false; onlineRole = null; opponentName = ''; opponentAvatar = '';
        socket?.disconnect(); socket = null;
        document.getElementById('win-overlay').classList.add('hidden');
        document.getElementById('lobby-overlay').classList.remove('hidden');
        showLobbyView(isDiscord ? 'lview-discord' : 'lview-mode');
        resetGame();
    } else {
        resetGame();
    }
});

document.getElementById('new-game-btn').addEventListener('click', () => {
    if (spectatorMode || gameState.gameOver) return;
    playSound('Select');
    if (onlineMode) {
        socket?.emit('surrender');
    } else {
        resetGame();
    }
});

document.getElementById('flip-btn').addEventListener('click', () => {
    if (flipAnimating) return;
    flipAnimating = true;
    playSound('Select');

    const reduce = !animEnabled || globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
        gameState.flipped = !gameState.flipped;
        render();
        flipAnimating = false;
        return;
    }

    // Spin the icon a half-turn each press, in sync with the board
    flipIconDeg += 180;
    const icon = document.querySelector('#flip-btn svg');
    if (icon) icon.style.transform = `rotate(${flipIconDeg}deg)`;

    // 3D flip: rotate edge-on, swap orientation while hidden, rotate back in
    const HALF = 210;
    canvas.style.transition = `transform ${HALF}ms ease-in`;
    canvas.style.transform  = 'rotateX(90deg)';

    setTimeout(() => {
        gameState.flipped = !gameState.flipped;
        render();
        canvas.style.transition = 'none';
        canvas.style.transform  = 'rotateX(-90deg)';
        canvas.getBoundingClientRect();          // commit the jump while edge-on
        requestAnimationFrame(() => {
            canvas.style.transition = `transform ${HALF}ms ease-out`;
            canvas.style.transform  = 'rotateX(0deg)';
            setTimeout(() => {
                canvas.style.transition = '';
                canvas.style.transform  = '';
                flipAnimating = false;
            }, HALF + 20);
        });
    }, HALF);
});

document.getElementById('tap-mode-btn').addEventListener('click', () => {
    playSound('Select');
    setTapMode(!tapMode);
});

document.getElementById('anim-btn').addEventListener('click', () => {
    playSound('Select');
    setAnimEnabled(!animEnabled);
});

document.getElementById('mute-btn').addEventListener('click', () => {
    muted = !muted;
    const btn  = document.getElementById('mute-btn');
    const icon = document.getElementById('mute-icon');
    btn.classList.toggle('muted', muted);
    icon.innerHTML = muted
        ? `<path d="M11 5 6 9H2v6h4l5 4V5z"/>
           <line x1="23" y1="9" x2="17" y2="15"/>
           <line x1="17" y1="9" x2="23" y2="15"/>`
        : `<path d="M11 5 6 9H2v6h4l5 4V5z"/>
           <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
           <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>`;
    if (animEnabled) {
        // Re-trigger the pop animation
        icon.style.animation = 'none';
        icon.getBoundingClientRect();
        icon.style.animation = 'mute-pop 0.32s ease';
    }
    showToast(muted ? 'Sound effects: OFF' : 'Sound effects: ON');
});

document.getElementById('change-mode-btn').addEventListener('click', () => {
    playSound('Select');
    const cmIcon = document.querySelector('#change-mode-btn svg');
    if (animEnabled && cmIcon) {
        cmIcon.style.animation = 'none';
        cmIcon.getBoundingClientRect();
        cmIcon.style.animation = 'ctrl-icon-pop 0.34s ease';
    }
    openSoftLobby(gameState.gameOver);
});

// ─── Discord Activity ─────────────────────────────────────────────────────

if (isDiscord) try {
    const { DiscordSDK, patchUrlMappings } = await import('./vendor/discord-sdk.mjs');
    const sdk = new DiscordSDK('1515199692793843712');
    await sdk.ready();
    discordInstanceId = sdk.instanceId;
    patchUrlMappings([{
        prefix: '/api',
        target: 'choridor-web-production.up.railway.app',
    }]);
    try {
        const { code } = await sdk.commands.authorize({ client_id: '1515199692793843712', scope: ['identify', 'rpc.activities.write'], response_type: 'code' });
        const res  = await fetch('/api/auth/discord', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
        });
        const data = await res.json();
        if (data.access_token) await sdk.commands.authenticate({ access_token: data.access_token });
        discordSdk = sdk;
        setDiscordPresence({ state: 'In lobby', assets: { large_image: 'embedded_cover', large_text: 'CHORIDOR', small_image: 'choridor_icon', small_text: 'CHORIDOR' } });
        if (data.username) {
            myAvatar = data.avatarUrl || '';
            const rawDisplay = String(data.username || '');
            const rawHandle  = String(data.handle   || '');
            const sanitize   = s => s.replace(/[^a-zA-Z0-9 _.\-#]/g, '').trim().slice(0, 20);
            const valid      = s => /^[a-zA-Z0-9 _.\-#]{1,20}$/.test(s);
            const safeDisplay = sanitize(rawDisplay);
            const safeHandle  = sanitize(rawHandle);
            const safeName = valid(safeDisplay) ? safeDisplay : safeHandle;
            if (valid(safeName)) {
                localStorage.setItem('choridor_player_name', safeName);
                if (nameInput) nameInput.value = safeName;
            }
        }
    } catch (authErr) {
        const errEl = document.getElementById('discord-error');
        if (errEl) { errEl.textContent = `Auth failed: ${authErr?.message || authErr}`; errEl.classList.remove('hidden'); }
    }
    // Auto-enter matchmaking queue
    initSocket('discord-error', () => {
        const statusText = document.getElementById('discord-status-text');
        if (statusText) statusText.textContent = 'Finding opponent...';
        setDiscordPresence({ state: 'Finding a match...', assets: { large_image: 'embedded_cover', large_text: 'CHORIDOR', small_image: 'choridor_icon', small_text: 'CHORIDOR' }, party: { size: [1, 2] } });
        socket.emit('join-activity', { instanceId: discordInstanceId, name: getMyName(), avatarUrl: myAvatar });
    });
} catch (e) {
    const errEl = document.getElementById('discord-error');
    if (errEl) { errEl.textContent = `Discord setup failed: ${e?.message || e}`; errEl.classList.remove('hidden'); }
}

// ─── Tap-confirm hint buttons ─────────────────────────────────────────────

document.getElementById('tap-confirm-yes')?.addEventListener('click', e => {
    e.stopPropagation();
    if (!tapMode || !isMyTurn() || gameState.gameOver) return;
    if (tapPreview) {
        const { row, col, orientation } = tapPreview;
        clearTapPreview();
        placeWall(row, col, orientation, false);
    } else if (tapMovePreview) {
        const { row, col } = tapMovePreview;
        clearTapPreview();
        movePawn(row, col);
    }
});

document.getElementById('tap-confirm-no')?.addEventListener('click', e => {
    e.stopPropagation();
    clearTapPreview();
    render();
});

// ─── Init ─────────────────────────────────────────────────────────────────

buildWallBoxes();
updateWallCounts();
updateStatus();

// Animations: off by default; only on when the player has explicitly enabled them
setAnimEnabled(localStorage.getItem('choridor_anim') === '1', true);

// Auto-enable tap mode on touch-primary devices (no hover, coarse pointer)
{
    const saved     = localStorage.getItem('choridor_tap_mode');
    const autoTouch = globalThis.matchMedia('(hover: none) and (pointer: coarse)').matches;
    const enable    = saved === null ? autoTouch : saved === '1';
    if (enable) {
        tapMode = true;
        const btn = document.getElementById('tap-mode-btn');
        if (btn) { btn.classList.add('tap-active'); btn.setAttribute('aria-pressed', 'true'); }
        // First-time touch users: a one-off nudge so the flow is discoverable
        if (saved === null && autoTouch && !localStorage.getItem('choridor_tap_hint_seen')) {
            localStorage.setItem('choridor_tap_hint_seen', '1');
            setTimeout(() => showToast('Confirm walls is on, pick a slot then confirm'), 800);
        }
    }
}

requestAnimationFrame(() => {
    resizeCanvas();
    updateLegalMoves();
    new ResizeObserver(() => { resizeCanvas(); render(); }).observe(canvas.parentElement);
});
