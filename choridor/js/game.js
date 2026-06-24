import { APP_VERSION } from './version.js';
import posthog from './vendor/posthog.mjs';
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

// ─── Analytics (PostHog) ────────────────────────────────────────────────────
// Client-side game telemetry. The server (analytics.js) stays the authoritative
// source for online matches; these client events additionally cover local and
// AI games the server never sees. Client events carry no $is_server flag, so
// dashboards filter on it to avoid double-counting online games. Analytics must
// never break gameplay, hence the swallows. `mode` is sent display-ready.
//
// posthog-js is bundled locally (js/vendor/posthog.mjs) rather than loaded from
// PostHog's CDN, because the Discord Activity sandbox blocks that CDN. On the
// web we hit PostHog directly; inside Discord we route ingestion through the
// `/phog` URL mapping (see the Discord block below), so init is deferred until
// after patchUrlMappings runs. advanced_disable_decide keeps us to ingestion
// only (no flags/surveys/recording, none of which we use).
// Discord appends launch params (guild_id, channel_id, instance_id, referrer_id,
// ...) to the activity URL. PostHog auto-captures the URL on pageviews and also
// stamps it onto the person's $initial_* properties, so strip the query/hash off
// every URL-bearing property before anything leaves the browser. This keeps
// Discord server/channel IDs out of analytics and collapses otherwise unique
// per-launch URLs into one clean entry.
const PH_URL_PROPS = ['$current_url', '$referrer', '$initial_current_url', '$initial_referrer'];
function stripUrlParams(value) {
    if (typeof value !== 'string') return value;
    const cut = value.search(/[?#]/);
    return cut === -1 ? value : value.slice(0, cut);
}
function sanitizeUrlProps(props) {
    if (!props || typeof props !== 'object') return;
    for (const key of PH_URL_PROPS) {
        if (key in props) props[key] = stripUrlParams(props[key]);
    }
}
let phReady = false;
function initPosthog(apiHost) {
    try {
        posthog.init('phc_op7vj5oq9nrZVLx6r6UgLBHBaBxwUoH7KzkPtsq2CvGF', {
            api_host: apiHost,
            person_profiles: 'always',
            autocapture: false,
            capture_pageview: true,
            capture_pageleave: true,
            advanced_disable_decide: true,
            before_send: (event) => {
                if (event) {
                    sanitizeUrlProps(event.properties);
                    sanitizeUrlProps(event.properties?.$set);
                    sanitizeUrlProps(event.properties?.$set_once);
                }
                return event;
            },
        });
        phReady = true;
    } catch { /* ignore */ }
}
function track(event, props = {}) {
    if (!phReady) return;
    try {
        posthog.capture(event, {
            source: location.hostname.endsWith('.discordsays.com') ? 'discord' : 'web',
            ...props,
        });
    } catch { /* ignore */ }
}
// Web initialises immediately. Discord initialises after patchUrlMappings (see
// the Discord Activity block), so its ingestion requests can leave the sandbox.
if (!location.hostname.endsWith('.discordsays.com')) initPosthog('https://eu.i.posthog.com');
function currentMode() {
    if (onlineMode) return 'Online';
    if (vsAI)       return 'AI';
    return 'Local';
}
// Stamped when a game actually begins so completion can report a duration.
let clientGameStartedAt = 0;
function trackGameStarted(mode) {
    clientGameStartedAt = Date.now();
    track('game_started', { mode });
}
function trackGameCompleted(winnerRole, reason) {
    // Spectating is not a played game. Filler ("play AI while you wait") games
    // are reported under their own mode label so they show up in per-mode stats
    // (e.g. average moves) without polluting the real AI/Online/Local series.
    if (spectatorMode) return;
    const movesP1 = gameState.movesP1;
    const movesP2 = gameState.movesP2;
    // Outcome from this device's perspective, so a person's timeline reads as
    // won/lost rather than just "p1 won". Online uses our seat; vs AI is the seat
    // the human holds (aiPlayer is the computer). Local is two humans on one
    // device, so there is no single player result: both stay null.
    let playerRole = null;
    if (onlineMode) playerRole = onlineRole;
    else if (vsAI)  playerRole = aiPlayer === 'p1' ? 'p2' : 'p1';
    let result = null;
    if (playerRole) result = winnerRole === playerRole ? 'won' : 'lost';
    track('game_completed', {
        mode:        fillerAI ? 'AI (waiting)' : currentMode(),
        winner_role: winnerRole,
        player_role: playerRole,
        result,
        reason,
        moves_p1:    movesP1,
        moves_p2:    movesP2,
        total_moves: movesP1 + movesP2,
        walls_used:  gameState.walls.size,
        duration_ms: clientGameStartedAt ? Date.now() - clientGameStartedAt : null,
    });
}

// ─── Audio ────────────────────────────────────────────────────────────────

// Request ambient audio session so SFX mix with background music (iOS 16.4+)
if (navigator.audioSession) navigator.audioSession.type = 'ambient';

const sounds = {};
['Move', 'Jump', 'Wall', 'Win', 'Loss', 'Select', 'Close'].forEach(name => {
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
let opponentReconnecting   = false;

const SESSION_KEY = 'choridor_session';
function storeSession(d)    { try { localStorage.setItem(SESSION_KEY, JSON.stringify(d)); } catch {} }
function clearSession()     { try { localStorage.removeItem(SESSION_KEY); } catch {} }
function getStoredSession() { try { const r = localStorage.getItem(SESSION_KEY); return r ? JSON.parse(r) : null; } catch { return null; } }

let _reconnectCountdownId = null;
function startReconnectCountdown(secs, who = 'Opponent') {
    clearReconnectCountdown();
    let remaining = secs;
    const tick = () => {
        if (!opponentReconnecting) return;
        const s = document.getElementById('status');
        s.textContent = `${who} reconnecting… ${remaining}s`;
        s.className   = 'status-label';
        if (remaining > 0) { remaining--; _reconnectCountdownId = setTimeout(tick, 1000); }
    };
    tick();
}
function clearReconnectCountdown() {
    if (_reconnectCountdownId) { clearTimeout(_reconnectCountdownId); _reconnectCountdownId = null; }
}
// Reset the "reconnecting" state and stop its status-label countdown.
function clearReconnectState() {
    opponentReconnecting = false;
    clearReconnectCountdown();
}

const isDiscord       = location.hostname.endsWith('.discordsays.com');
let discordInstanceId = null;
let discordUserId     = null; // stable Discord user id, set after auth (analytics identity + per-user prefs)
let htpAuthToken      = null; // signed token from auth, lets us persist this user's tutorial flag
let discordSdk        = null;
let discordRejoinPending = false; // true while a Discord boot rejoin is awaiting its result
let matchStartTime    = 0;
let matchRoomCode     = '';
let _presenceTimer    = null;
if (isDiscord) { document.body.classList.add('discord-activity'); document.getElementById('change-mode-btn')?.classList.add('hidden'); }

let spectatorMode  = false;
let spectatorCount = 0;

let vsAI       = false;
let aiPlayer   = 'p2'; // which slot the AI occupies; swaps on Play Again
let aiWorker   = null;
let aiThinking = false;
let fillerAI   = false; // a throwaway AI game played while still waiting for a real opponent

function setDiscordPresence(activity) {
    if (!discordSdk) return;
    clearTimeout(_presenceTimer);
    _presenceTimer = setTimeout(() => {
        discordSdk.commands.setActivity({ activity }).catch(err => console.warn('setActivity failed:', err));
    }, 500);
}

function isMyTurn() {
    if (spectatorMode || opponentReconnecting) return false;
    if (vsAI && (gameState.currentPlayer === aiPlayer || aiThinking)) return false;
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
    if (!isMyTurn() || gameState.gameOver) return;
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

// ─── Coordinate helper ────────────────────────────────────────────────────

function clientToCell(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    let x = (clientX - rect.left) / boardScale;
    let y = (clientY - rect.top)  / boardScale;
    if (gameState.flipped) { x = BOARD_TOTAL - x; y = BOARD_TOTAL - y; }
    const cellX  = Math.floor(x / STEP), cellY  = Math.floor(y / STEP);
    const offX   = x - cellX * STEP,     offY   = y - cellY * STEP;
    const inHGap = offY >= CELL_SIZE && cellY < BOARD_SIZE - 1;
    const inVGap = offX >= CELL_SIZE && cellX < BOARD_SIZE - 1;
    return { x, y, cellX, cellY, inHGap, inVGap };
}

// ─── Click / drag shared state ────────────────────────────────────────────

let _suppressNextClick = false;
let dragState = null; // { fromTouch, isDragging, startX, startY } | null
const DRAG_THRESHOLD = 12; // board-space px; below this a gesture is a tap, not a drag

// ─── Click handling ───────────────────────────────────────────────────────

canvas.addEventListener('click', e => {
    if (_suppressNextClick) { _suppressNextClick = false; return; }
    if (gameState.gameOver || !isMyTurn() || flipAnimating) return;
    const { x, y, cellX, cellY, inHGap, inVGap } = clientToCell(e.clientX, e.clientY);

    if (!inHGap && !inVGap) {
        if (tapMode) {
            handleTapMove(cellY, cellX);
        } else {
            clearTapPreview();
            movePawn(cellY, cellX);
        }
    } else {
        // Reuse computeHoverState so click always places exactly what hover shows
        const { wallRow, wallCol, wallOrientation } = computeHoverState(x, y, cellX, cellY, inHGap, inVGap);
        if (tapMode) handleTapWall(wallRow, wallCol, wallOrientation);
        else         placeWall(wallRow, wallCol, wallOrientation);
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

function computeHoverState(x, y, cellX, cellY, inHGap, inVGap) {
    const empty = { wallRow: null, wallCol: null, wallOrientation: null, moveRow: null, moveCol: null };
    if (!isMyTurn() || gameState.gameOver) return empty;
    if (!inHGap && !inVGap) {
        const move = gameState.legalMoves.find(m => m.row === cellY && m.col === cellX);
        return { ...empty, moveRow: move?.row ?? null, moveCol: move?.col ?? null };
    }
    const halfGap = GAP / 2;
    const snap = v => Math.max(0, Math.min(BOARD_SIZE - 2, Math.round((v - CELL_SIZE - halfGap) / STEP)));
    // At intersections use perpendicular depth: pick the gap the cursor is deeper inside
    let useH = inHGap;
    if (inHGap && inVGap) {
        const hDist = Math.abs(y - (cellY * STEP + CELL_SIZE + halfGap));
        const vDist = Math.abs(x - (cellX * STEP + CELL_SIZE + halfGap));
        useH = hDist <= vDist;
    }
    return { ...empty,
        wallRow: useH ? cellY   : snap(y),
        wallCol: useH ? snap(x) : cellX,
        wallOrientation: useH ? 'H' : 'V' };
}

function isPointerHover() {
    if (hoverState.moveRow !== null) return true;
    if (hoverState.wallRow === null) return false;
    const cp = gameState.currentPlayer;
    const hasWalls = cp === 'p1' ? gameState.wallCounts.p1 > 0 : gameState.wallCounts.p2 > 0;
    const { wallRow: wr, wallCol: wc, wallOrientation: wo } = hoverState;
    const wk = JSON.stringify({ row: wr, col: wc, orientation: wo });
    return hasWalls && !gameState.walls.has(wk) && !hasWallOverlap(wr, wc, wo) && wallKeepsPathsOpen(wk);
}

canvas.addEventListener('mousemove', e => {
    const { x, y, cellX, cellY, inHGap, inVGap } = clientToCell(e.clientX, e.clientY);

    if (dragState && !dragState.fromTouch) {
        const dx = x - dragState.startX, dy = y - dragState.startY;
        if (dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) dragState.isDragging = true;
    }

    const prev = JSON.stringify(hoverState);
    if (dragState?.isDragging && !dragState.fromTouch && !gameState.gameOver && isMyTurn()) {
        hoverState = nearestWallToPoint(x, y);
    } else {
        hoverState = computeHoverState(x, y, cellX, cellY, inHGap, inVGap);
    }

    canvas.style.cursor = isPointerHover() ? 'pointer' : 'default';
    if (JSON.stringify(hoverState) !== prev) render();
});

canvas.addEventListener('mouseleave', () => {
    dragState = null;
    hoverState = { wallRow: null, wallCol: null, wallOrientation: null, moveRow: null, moveCol: null };
    canvas.style.cursor = 'default';
    render();
});

// ─── Drag-to-place ────────────────────────────────────────────────────────
// Drag across the board; the wall preview snaps to the nearest valid gap and
// follows the finger/cursor. Release to place (or lock a confirm-mode preview).
// Short taps fall through to the existing click handler unchanged.

const EMPTY_HOVER = { wallRow: null, wallCol: null, wallOrientation: null, moveRow: null, moveCol: null };

// Returns the nearest wall slot (H or V) to board-space point (x, y).
function nearestWallToPoint(x, y) {
    const halfGap = GAP / 2;
    // Nearest H gap: horizontal wall between rows
    // hCol uses centered snap: round to whichever 2-cell span center is nearest along x
    const hRow  = Math.max(0, Math.min(BOARD_SIZE - 2, Math.round((y - CELL_SIZE - halfGap) / STEP)));
    const hCol  = Math.max(0, Math.min(BOARD_SIZE - 2, Math.round((x - CELL_SIZE - halfGap) / STEP)));
    const hDist = Math.abs(y - (hRow * STEP + CELL_SIZE + halfGap));
    // Nearest V gap: vertical wall between columns
    // vRow uses centered snap: round to whichever 2-cell span center is nearest along y
    const vCol  = Math.max(0, Math.min(BOARD_SIZE - 2, Math.round((x - CELL_SIZE - halfGap) / STEP)));
    const vRow  = Math.max(0, Math.min(BOARD_SIZE - 2, Math.round((y - CELL_SIZE - halfGap) / STEP)));
    const vDist = Math.abs(x - (vCol * STEP + CELL_SIZE + halfGap));
    return hDist < vDist
        ? { wallRow: hRow, wallCol: hCol, wallOrientation: 'H', moveRow: null, moveCol: null }
        : { wallRow: vRow, wallCol: vCol, wallOrientation: 'V', moveRow: null, moveCol: null };
}

function commitWallAtHover() {
    const { wallRow, wallCol, wallOrientation } = hoverState;
    if (wallRow === null) return false;
    if (tapMode) handleTapWall(wallRow, wallCol, wallOrientation);
    else         placeWall(wallRow, wallCol, wallOrientation);
    return true;
}

// ── Touch ──
canvas.addEventListener('touchstart', e => {
    if (gameState.gameOver || !isMyTurn() || flipAnimating) return;
    if (e.touches.length !== 1) { dragState = null; return; }
    const t = e.touches[0];
    const { x, y, inHGap, inVGap } = clientToCell(t.clientX, t.clientY);
    dragState = { fromTouch: true, isDragging: false, startX: x, startY: y, startedOnGap: inHGap || inVGap };
    if (inHGap || inVGap) {
        // Show snap preview immediately on gap touches; prevents scroll and synthetic click
        hoverState = nearestWallToPoint(x, y);
        render();
        e.preventDefault();
    }
}, { passive: false });

canvas.addEventListener('touchmove', e => {
    if (!dragState?.fromTouch) return;
    if (e.touches.length > 1) {
        // Multi-touch cancels the drag and clears any preview
        dragState = null;
        hoverState = EMPTY_HOVER;
        render();
        return;
    }
    const t = e.touches[0];

    // If the finger has left the board, hide the preview but keep the drag alive
    // so it resumes naturally if the finger re-enters
    const rect = canvas.getBoundingClientRect();
    const inBounds = t.clientX >= rect.left && t.clientX <= rect.right &&
                     t.clientY >= rect.top  && t.clientY <= rect.bottom;
    if (!inBounds) {
        if (hoverState.wallRow !== null) { hoverState = EMPTY_HOVER; render(); }
        return;
    }

    const { x, y, inHGap, inVGap } = clientToCell(t.clientX, t.clientY);
    const nowInGap = inHGap || inVGap;
    const dx = x - dragState.startX, dy = y - dragState.startY;
    const movedEnough = dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD;
    // Only become a wall drag if the gesture started or entered a gap zone;
    // finger tremor on a pawn move square must never trigger wall placement
    if (movedEnough && (dragState.startedOnGap || nowInGap)) dragState.isDragging = true;
    if (dragState.isDragging) e.preventDefault();
    // Update wall preview only when near a gap or actively dragging
    if (dragState.startedOnGap || nowInGap || dragState.isDragging) {
        const next = nearestWallToPoint(x, y);
        if (JSON.stringify(hoverState) !== JSON.stringify(next)) { hoverState = next; render(); }
    }
}, { passive: false });

canvas.addEventListener('touchend', e => {
    if (!dragState?.fromTouch) { dragState = null; return; }
    const wasDragging = dragState.isDragging;
    const startedOnGap = dragState.startedOnGap;
    dragState = null;
    if (!wasDragging) {
        if (startedOnGap) {
            // touchstart called preventDefault, which already suppresses the synthetic
            // click — commit the wall here; do NOT set _suppressNextClick or it
            // will bleed into the next tap and eat a pawn move
            if (!commitWallAtHover()) { hoverState = EMPTY_HOVER; render(); }
        } else {
            // Cell tap: click will fire normally for pawn moves; clear wall ghost
            hoverState = EMPTY_HOVER;
            render();
        }
        return;
    }
    // If the finger lifted outside the board, cancel without placing
    const t = e.changedTouches[0];
    const rect = canvas.getBoundingClientRect();
    const inBounds = t.clientX >= rect.left && t.clientX <= rect.right &&
                     t.clientY >= rect.top  && t.clientY <= rect.bottom;
    if (!inBounds) { hoverState = EMPTY_HOVER; render(); return; }
    // touchstart already called preventDefault on gap-origin drags, suppressing
    // click — only set _suppressNextClick for cell-origin drags where touchstart
    // did not preventDefault, so the flag doesn't bleed into the next pawn tap
    if (!startedOnGap) _suppressNextClick = true;
    const { x, y } = clientToCell(t.clientX, t.clientY);
    hoverState = nearestWallToPoint(x, y);
    commitWallAtHover();
    hoverState = EMPTY_HOVER;
    render();
});

canvas.addEventListener('touchcancel', () => {
    dragState = null;
    hoverState = EMPTY_HOVER;
    render();
});

// ── Mouse ──
canvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (gameState.gameOver || !isMyTurn() || flipAnimating) return;
    const { x, y } = clientToCell(e.clientX, e.clientY);
    dragState = { fromTouch: false, isDragging: false, startX: x, startY: y };
});

canvas.addEventListener('mouseup', e => {
    if (!dragState || dragState.fromTouch) return;
    const wasDragging = dragState.isDragging;
    dragState = null;
    if (!wasDragging) return; // short click — let the click handler fire normally
    _suppressNextClick = true;
    if (!commitWallAtHover()) { hoverState = EMPTY_HOVER; render(); }
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
    hoverState = EMPTY_HOVER;
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
    if (vsAI) triggerAI();
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
    if (vsAI) triggerAI();
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

// ─── AI ───────────────────────────────────────────────────────────────────

function triggerAI() {
    if (!vsAI || gameState.gameOver || gameState.currentPlayer !== aiPlayer) return;
    if (!aiWorker) {
        aiWorker = new Worker('js/ai-worker.js');
        aiWorker.onmessage = function(e) {
            aiThinking = false;
            const { move } = e.data;
            if (!vsAI || gameState.gameOver) { updateStatus(); updateLegalMoves(); return; }
            if (move.type === 'pawn') applyOpponentPawnMove(move);
            else applyOpponentWallMove(move);
        };
    }
    aiThinking = true;
    updateStatus();
    updateLegalMoves();
    const walls = [...gameState.walls].map(k => JSON.parse(k));
    aiWorker.postMessage({
        aiPlayer,
        state: {
            p1: { ...gameState.p1Pawn },
            p2: { ...gameState.p2Pawn },
            walls,
            wc: { ...gameState.wallCounts },
        }
    });
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

function updateStatusVsAI(status) {
    const humanPlayer = aiPlayer === 'p1' ? 'p2' : 'p1';
    if (aiThinking) {
        status.textContent = 'AI is thinking…';
        status.className   = `status-label ${aiPlayer}`;
    } else if (gameState.currentPlayer === humanPlayer) {
        const name = document.getElementById(`${humanPlayer}-name`).textContent;
        status.textContent = name === 'You' ? 'Your Turn' : `${name}'s Turn`;
        status.className   = `status-label ${humanPlayer}`;
    } else {
        status.textContent = "AI's Turn";
        status.className   = `status-label ${aiPlayer}`;
    }
}

function updateStatus() {
    const status = document.getElementById('status');
    if (vsAI) {
        updateStatusVsAI(status);
        updateTapHint();
        return;
    }
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
        reportWin('p1');
        showWinScreen(document.getElementById('p1-name').textContent, 'p1', delay);
        return true;
    }
    if (gameState.p2Pawn.row === BOARD_SIZE - 1) {
        reportWin('p2');
        showWinScreen(document.getElementById('p2-name').textContent, 'p2', delay);
        return true;
    }
    return false;
}

// Tell the server who reached the goal so it can record the completed game for
// analytics. Online players only (spectators and local/AI games are skipped).
function reportWin(winnerRole) {
    if (!onlineMode || spectatorMode || !socket) return;
    socket.emit('report-win', { winnerRole });
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

function showWinScreen(winner, playerClass, delay = 0, reason = 'reached-goal') {
    clearTapPreview();
    gameState.gameOver = true;   // lock input now; reveal the card after the move lands
    trackGameCompleted(playerClass, reason);
    if (onlineMode) clearSession();
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
    setWinnerPawnAvatar(playerClass);
    const msg = document.getElementById('win-message');
    msg.textContent = winner === 'You' ? 'You win!' : `${winner} wins!`;
    msg.className   = `win-title ${playerClass}`;

    document.getElementById('play-again-btn').classList.toggle('hidden', onlineMode || spectatorMode);
    document.getElementById('btn-rematch').classList.toggle('hidden', !onlineMode || spectatorMode);
    document.getElementById('btn-change-mode').classList.toggle('hidden', !onlineMode || spectatorMode || isDiscord);
    document.getElementById('btn-step-aside').classList.toggle('hidden', !onlineMode || spectatorMode || spectatorCount === 0);
    if (onlineMode) updateRematchBtn('idle');
    populateWinStats();
    resetWinFeedback();

    const reveal = () => {
        const lost = vsAI
            ? playerClass === aiPlayer
            : (onlineMode && onlineRole && onlineRole !== playerClass);
        playSound(lost ? 'Loss' : 'Win');
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
    aiThinking = false;
    let nextFlipped;
    if (onlineMode) nextFlipped = onlineRole === 'p2';
    else if (vsAI) nextFlipped = aiPlayer === 'p1';
    else nextFlipped = gameState.flipped;
    gameState = {
        p1Pawn:        { row: 8, col: 4 },
        p2Pawn:        { row: 0, col: 4 },
        walls:         new Set(),
        wallOwners:    new Map(),
        wallCounts:    { p1: WALLS_PER_PLAYER, p2: WALLS_PER_PLAYER },
        currentPlayer: 'p1',
        legalMoves:    [],
        flipped:       nextFlipped,
        gameOver:      false,
        movesP1:       0,
        movesP2:       0,
    };
    document.getElementById('win-overlay').classList.add('hidden');
    document.getElementById('win-footer').classList.add('hidden');
    document.getElementById('discord-rejoin-bar').classList.add('hidden');
    document.getElementById('spectator-offer-bar').classList.add('hidden');
    document.getElementById('spectator-slot-bar').classList.add('hidden');
    const stepBtn = document.getElementById('btn-step-aside');
    if (stepBtn) { stepBtn.querySelector('span').textContent = 'Step aside'; stepBtn.disabled = false; }
    if (vsAI) {
        const humanPlayer = aiPlayer === 'p1' ? 'p2' : 'p1';
        document.getElementById('p1-name').textContent = humanPlayer === 'p1' ? (getMyName() || 'You') : 'AI';
        document.getElementById('p2-name').textContent = humanPlayer === 'p2' ? (getMyName() || 'You') : 'AI';
        setAiAvatars();
    }
    updateWallCounts();
    updateStatus();
    updateLegalMoves();
}

function setFillerWaitingLabel() {
    const label = document.getElementById('filler-waiting-label');
    if (!label) return;
    if (isDiscord) { label.textContent = 'Finding opponent…'; return; }
    const code = document.getElementById('room-code-display').textContent;
    label.textContent = code ? `Waiting for a friend · ${code}` : 'Waiting for a friend';
}

// Start a throwaway AI game while the socket stays in the room / matchmaking queue.
// Does not touch onlineMode/onlineRole/socket; game-start swaps in the real match.
function startFillerAI() {
    playSound('Select');
    track('ai_while_waiting_clicked');
    vsAI = true;
    aiPlayer = 'p2';
    fillerAI = true;
    clientGameStartedAt = Date.now(); // for game_completed duration; filler skips trackGameStarted
    clearPlayerAvatars();
    setFillerWaitingLabel();
    document.getElementById('filler-waiting-bar').classList.remove('hidden');
    hideLobby();
    resetGame();
}

function stopFillerAI() {
    if (!fillerAI) return;
    fillerAI = false;
    vsAI = false;
    aiThinking = false;
    if (aiWorker) { aiWorker.terminate(); aiWorker = null; }
    document.getElementById('filler-waiting-bar').classList.add('hidden');
}

// ─── Online: socket setup ─────────────────────────────────────────────────

function handleOpponentDisconnected() {
    clearSession();
    opponentReconnecting = false;
    clearReconnectCountdown();
    if (rematchState !== 'idle') updateRematchBtn('idle');
    opponentName   = '';
    opponentAvatar = '';
    applyPlayerNames();
    if (isDiscord) {
        setDiscordPresence({ state: 'In lobby', assets: { large_image: 'embedded_cover', large_text: 'CHORIDOR', small_image: 'choridor_icon', small_text: 'CHORIDOR' } });
        document.getElementById('discord-rejoin-bar').classList.remove('hidden');
    }
    gameState.gameOver = true;
    hoverState = { wallRow: null, wallCol: null, wallOrientation: null, moveRow: null, moveCol: null };
    clearTapPreview();
    render();
    const s = document.getElementById('status');
    s.textContent = 'Opponent disconnected';
    s.className   = 'status-label';
}

function leaveSoftLobby() {
    vsAI = false; aiThinking = false;
    if (aiWorker) { aiWorker.terminate(); aiWorker = null; }
    onlineMode = false; onlineRole = null; opponentName = ''; opponentAvatar = '';
    spectatorMode = false;
    socket?.disconnect(); socket = null;
    softLobby = false; softLobbyRestoreWin = false;
    // The back X only works while softLobby is true; hide it so it does not
    // linger as a dead button after leaving (e.g. creating an online room).
    document.getElementById('btn-lobby-back').classList.add('hidden');
    resetGame();
}

function handleRematchClick() {
    playSound('Select');
    if (spectatorMode) return;
    if (rematchState === 'idle' || rematchState === 'incoming') {
        track('rematch_clicked', { mode: 'Online' });
        socket?.emit('rematch-request');
        updateRematchBtn('waiting');
    } else if (rematchState === 'waiting') {
        socket?.emit('rematch-cancel');
        updateRematchBtn('idle');
    }
}

function initSocket(errorElId, callback) {
    // Already connected: the join/create fires immediately, so the button must
    // not stay stuck on "Connecting…" (no fresh 'connect' event will clear it).
    if (socket?.connected) { clearConnectingBtn(); callback(); return; }
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

    // Fires on every (re)connect after the initial one — attempt to rejoin a live room
    socket.on('connect', () => {
        const session = getStoredSession();
        if (session && onlineMode && !spectatorMode) socket.emit('rejoin-room', session);
    });

    socket.on('disconnect', reason => {
        if (reason === 'io client disconnect') { clearSession(); return; }
        if (onlineMode && !spectatorMode) {
            const s = document.getElementById('status');
            s.textContent = 'Reconnecting…';
            s.className   = 'status-label';
        }
    });

    socket.on('session-token', ({ token, role, code } = {}) => {
        if (token && role && code) storeSession({ code, role, token });
    });

    socket.on('rejoin-success', ({ role, snapshot, p1Name, p2Name, p1Avatar, p2Avatar, code } = {}) => {
        discordRejoinPending = false;
        spectatorMode        = false;
        onlineRole           = role;
        onlineMode           = true;
        opponentReconnecting = false;
        clearReconnectCountdown();
        opponentName   = role === 'p1' ? (p2Name   || '') : (p1Name   || '');
        opponentAvatar = role === 'p1' ? (p2Avatar || '') : (p1Avatar || '');
        matchRoomCode  = code || matchRoomCode;
        if (!matchStartTime) matchStartTime = Math.floor(Date.now() / 1000);
        gameState.flipped = role === 'p2';
        applyPlayerNames();
        hideLobby();
        if (snapshot) { applyGameSnapshot(snapshot); updateWallCounts(); }
        updateStatus();
        updateLegalMoves();
        render();
    });

    // If we were already in a game (same-tab reconnect), treat as opponent disconnect.
    // If this is a fresh page load with a stale session, just clear quietly.
    socket.on('rejoin-failed', () => {
        if (discordRejoinPending) {
            // The activity game is gone (or grace expired): drop into matchmaking.
            discordRejoinPending = false;
            clearSession();
            const statusText = document.getElementById('discord-status-text');
            if (statusText) statusText.textContent = 'Finding opponent...';
            setDiscordPresence({ state: 'Finding a match...', assets: { large_image: 'embedded_cover', large_text: 'CHORIDOR', small_image: 'choridor_icon', small_text: 'CHORIDOR' }, party: { size: [1, 2] } });
            socket.emit('join-activity', { instanceId: discordInstanceId, name: getMyName(), avatarUrl: myAvatar });
            return;
        }
        if (onlineMode) handleOpponentDisconnected();
        else clearSession();
    });

    socket.on('opponent-reconnecting', ({ graceSecs } = {}) => {
        opponentReconnecting = true;
        clearTapPreview();
        render();
        startReconnectCountdown(graceSecs ?? 12);
    });

    socket.on('opponent-reconnected', () => {
        opponentReconnecting = false;
        clearReconnectCountdown();
        updateStatus();
        updateLegalMoves();
        render();
    });

    // Spectators see a disconnect in the same status label players do.
    socket.on('spectator-player-disconnected', ({ name, graceSecs } = {}) => {
        if (!spectatorMode) return;
        opponentReconnecting = true;
        startReconnectCountdown(graceSecs ?? 12, name || 'A player');
    });

    socket.on('spectator-player-reconnected', () => {
        if (!spectatorMode) return;
        clearReconnectState();
        updateStatus();
    });

    socket.on('room-created', ({ code }) => {
        onlineRole = 'p1';
        document.getElementById('room-code-display').textContent = code;
        showLobbyView('lview-waiting');
    });

    socket.on('room-joined', () => { onlineRole = 'p2'; });

    socket.on('game-start', ({ p1Name, p2Name, p1Avatar, p2Avatar, role, code } = {}) => {
        if (fillerAI) { playSound('Select'); showToast('Opponent found!'); }
        fillerAI = false;
        document.getElementById('filler-waiting-bar').classList.add('hidden');
        vsAI = false; aiThinking = false;
        if (aiWorker) { aiWorker.terminate(); aiWorker = null; }
        if (role) onlineRole = role;
        opponentName   = onlineRole === 'p1' ? (p2Name   || '') : (p1Name   || '');
        opponentAvatar = onlineRole === 'p1' ? (p2Avatar || '') : (p1Avatar || '');
        matchStartTime = Math.floor(Date.now() / 1000);
        matchRoomCode  = code || '';
        onlineMode = true;
        hideLobby();
        applyPlayerNames();
        resetGame();
        trackGameStarted('Online');
    });

    socket.on('opponent-move', data => applyOpponentMove(data));

    socket.on('room-error', msg => showLobbyError(errorElId, msg));

    // Keep onlineMode=true so New Game/Change Mode still route to the lobby
    socket.on('opponent-left', () => { handleOpponentDisconnected(); });

    socket.on('rematch-requested', () => {
        updateRematchBtn('incoming');
        if (softLobby) showToast('Opponent wants a rematch!');
    });
    socket.on('rematch-cancelled', () => updateRematchBtn('idle'));

    socket.on('rematch-start', ({ p1Name, p2Name, p1Avatar, p2Avatar } = {}) => {
        if (spectatorMode) {
            clearReconnectState();
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
            hideLobby();
            document.getElementById('btn-lobby-back').classList.add('hidden');
        }
        applyPlayerNames();
        resetGame();
        trackGameStarted('Online');
    });

    socket.on('spectate-start', ({ p1Name, p2Name, p1Avatar, p2Avatar, snapshot, queuePosition, spectatorCount: sc, steppedAside } = {}) => {
        stopFillerAI();
        clearReconnectState();
        spectatorMode  = true;
        onlineMode     = false;
        if (steppedAside) { onlineRole = null; opponentName = ''; opponentAvatar = ''; }
        spectatorCount = sc || 1;
        document.getElementById('p1-name').textContent = p1Name || 'Player 1';
        document.getElementById('p2-name').textContent = p2Name || 'Player 2';
        setPlayerAvatar('p1', p1Avatar || '');
        setPlayerAvatar('p2', p2Avatar || '');
        resetGame();
        if (snapshot) { applyGameSnapshot(snapshot); updateWallCounts(); }
        hideLobby();
        if (!isDiscord) showToast(steppedAside ? 'You are now spectating' : 'Room is full - watching as spectator');
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
        if (gameState.gameOver && onlineMode && !spectatorMode) {
            document.getElementById('btn-step-aside').classList.toggle('hidden', count === 0);
        }
    });

    socket.on('queue-position', pos => {
        if (spectatorMode) updateSpectatorBanner(pos);
    });

    socket.on('become-player', ({ role, p1Name, p2Name, p1Avatar, p2Avatar, code, token } = {}) => {
        stopFillerAI();
        clearReconnectState();
        spectatorMode  = false;
        onlineRole     = role;
        onlineMode     = true;
        if (token && code) storeSession({ code, role, token });
        opponentName   = role === 'p1' ? (p2Name || '') : (p1Name || '');
        opponentAvatar = role === 'p1' ? (p2Avatar || '') : (p1Avatar || '');
        matchStartTime = Math.floor(Date.now() / 1000);
        if (code != null) matchRoomCode = code;
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

    // First player in a fresh activity, or a lone spectator whose game emptied out:
    // drop any game/spectator state and wait for an opponent in matchmaking.
    socket.on('activity-waiting', () => {
        stopFillerAI();
        clearSession();
        spectatorMode = false;
        onlineMode    = false;
        onlineRole    = null;
        discordRejoinPending = false;
        document.getElementById('win-overlay').classList.add('hidden');
        document.getElementById('win-footer').classList.add('hidden');
        document.getElementById('discord-rejoin-bar').classList.add('hidden');
        updateSpectatorBanner(0);
        updateSpectatorCountUI(0);
        setDiscordPresence({ state: 'Finding a match...', assets: { large_image: 'embedded_cover', large_text: 'CHORIDOR', small_image: 'choridor_icon', small_text: 'CHORIDOR' }, party: { size: [1, 2] } });
        const statusText = document.getElementById('discord-status-text');
        if (statusText) statusText.textContent = 'Finding opponent...';
        showLobby();
        showLobbyView('lview-discord');
    });

    // Shown to a player when offered to play with a queued spectator
    socket.on('spectator-offer', ({ name, avatarUrl, opponentSteppingAside } = {}) => {
        // Grace period is over: stop the "Opponent reconnecting..." countdown so it
        // does not stay stuck at "0s" while the promotion offer is shown.
        opponentReconnecting = false;
        clearReconnectCountdown();
        updateStatus();
        document.getElementById('spectator-offer-name').textContent = name || 'spectator';
        if (!document.getElementById('win-overlay').classList.contains('hidden')) {
            document.getElementById('win-overlay').classList.add('hidden');
            document.getElementById('win-footer').classList.remove('hidden');
        }
        if (rematchState === 'waiting') { socket?.emit('rematch-cancel'); updateRematchBtn('idle'); }
        if (opponentSteppingAside) showToast('Opponent is stepping aside');
        document.getElementById('win-footer').classList.add('hidden');
        document.getElementById('spectator-offer-bar').classList.remove('hidden');
        document.getElementById('discord-rejoin-bar').classList.add('hidden');
        document.getElementById('btn-step-aside').classList.add('hidden');
    });

    // Shown to the spectator when a slot opens up (no accept needed - they're pre-accepted)
    socket.on('spectator-slot-offer', ({ opponentName } = {}) => {
        clearReconnectState();
        document.getElementById('spectator-slot-opponent').textContent = opponentName || 'opponent';
        document.getElementById('spectator-slot-accept').classList.add('hidden');
        if (!document.getElementById('win-overlay').classList.contains('hidden')) {
            document.getElementById('win-overlay').classList.add('hidden');
        }
        document.getElementById('win-footer').classList.add('hidden');
        document.getElementById('spectator-slot-bar').classList.remove('hidden');
    });

    socket.on('spectator-offer-cancelled', () => {
        document.getElementById('spectator-offer-bar').classList.add('hidden');
        document.getElementById('spectator-slot-bar').classList.add('hidden');
        document.getElementById('spectator-slot-accept').classList.remove('hidden');
        document.getElementById('btn-step-aside').classList.toggle('hidden',
            !onlineMode || spectatorMode || spectatorCount === 0 || !gameState.gameOver);
    });

    // Step-aside accepted by server, waiting for the other parties
    socket.on('step-aside-waiting', () => {
        const btn = document.getElementById('btn-step-aside');
        btn.querySelector('span').textContent = 'Waiting…';
        btn.disabled = true;
    });

    // The other party declined - revert the step-aside button
    socket.on('step-aside-declined', () => {
        const btn = document.getElementById('btn-step-aside');
        btn.querySelector('span').textContent = 'Step aside';
        btn.disabled = false;
    });

    socket.on('game-surrendered', ({ winnerRole, winnerName } = {}) => {
        if (gameState.gameOver) return;
        showWinScreen(winnerName || (winnerRole === 'p1' ? 'Player 1' : 'Player 2'), winnerRole, 0, 'surrender');
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
    if (document.getElementById('legal-modal').classList.contains('hidden')) return;
    playSound('Close');
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

let _lobbyFadeTimer = null;

// Fade the lobby overlay out, then remove it once the transition finishes.
function hideLobby() {
    const overlay = document.getElementById('lobby-overlay');
    if (overlay.classList.contains('hidden')) return;
    clearTimeout(_lobbyFadeTimer);
    overlay.classList.add('lobby-fade-out');
    _lobbyFadeTimer = setTimeout(() => {
        if (overlay.classList.contains('lobby-fade-out')) overlay.classList.add('hidden');
        overlay.classList.remove('lobby-fade-out');
    }, 300);
}

// Show the lobby overlay with a fade-in (counterpart to hideLobby).
function showLobby() {
    const overlay = document.getElementById('lobby-overlay');
    clearTimeout(_lobbyFadeTimer);
    overlay.classList.add('lobby-fade-out');
    overlay.classList.remove('hidden');
    overlay.getBoundingClientRect(); // force reflow so the fade-in transition runs
    overlay.classList.remove('lobby-fade-out');
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
    if (spectatorMode) return;
    let cardMod   = ' win-btn--primary';
    let footerMod = '';
    let label     = 'Rematch';
    if (state === 'waiting')  { cardMod = ' waiting';                  footerMod = ' waiting';  label = 'Waiting…'; }
    if (state === 'incoming') { cardMod = ' win-btn--primary incoming'; footerMod = ' incoming'; label = 'Accept Rematch!'; }

    const btn = document.getElementById('btn-rematch');
    if (btn) { btn.className = 'win-btn' + cardMod; btn.querySelector('span').textContent = label; btn.disabled = false; }

    const footer = document.getElementById('win-footer-rematch');
    if (footer) { footer.className = 'win-footer-btn' + footerMod; footer.textContent = label; }
}

function setPlayerAvatar(slot, url) {
    const img  = document.getElementById(`${slot}-avatar-img`);
    if (!img) return;
    if (!url) { img.src = ''; img.classList.add('hidden'); return; }
    img.src = url;
    img.classList.remove('hidden');
}

function clearPlayerAvatars() {
    ['p1', 'p2'].forEach(slot => {
        const img = document.getElementById(`${slot}-avatar-img`);
        if (img) { img.src = ''; img.classList.add('hidden'); }
    });
}

// Local AI face. The human keeps their Discord avatar (empty on web -> hidden),
// the AI seat gets the robot, so AI games show profile pictures like online does.
const ROBOT_PFP = 'images/IRobot.jpg';
// Separate, larger AI portrait shown only on the win screen when the AI wins.
const ROBOT_WIN_PFP = 'images/IRobot2.jpg';
function setAiAvatars() {
    const humanPlayer = aiPlayer === 'p1' ? 'p2' : 'p1';
    setPlayerAvatar(aiPlayer, ROBOT_PFP);
    setPlayerAvatar(humanPlayer, myAvatar);
}

// Picture in the win-card pawn dot: the AI's win portrait when the AI wins,
// otherwise the winner's board avatar (Discord pic), else the plain colored dot.
function winnerPawnSrc(playerClass) {
    if (vsAI && playerClass === aiPlayer) return ROBOT_WIN_PFP;
    const board = document.getElementById(`${playerClass}-avatar-img`);
    if (board && !board.classList.contains('hidden')) return board.getAttribute('src') || '';
    return '';
}

function setWinnerPawnAvatar(playerClass) {
    const img = document.getElementById('win-pawn-img');
    if (!img) return;
    const src = winnerPawnSrc(playerClass);
    if (src) { img.src = src; img.classList.remove('hidden'); }
    else     { img.removeAttribute('src'); img.classList.add('hidden'); }
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
    } else if (vsAI) {
        const humanPlayer = aiPlayer === 'p1' ? 'p2' : 'p1';
        document.getElementById('p1-name').textContent = humanPlayer === 'p1' ? (name || 'You') : 'AI';
        document.getElementById('p2-name').textContent = humanPlayer === 'p2' ? (name || 'You') : 'AI';
        setAiAvatars();
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
    if (joinNameInput) joinNameInput.value = nameInput.value;
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

// Chromium keeps :hover stuck on a pressed button until release, so holding
// and dragging the cursor off a lobby row leaves the highlight on. Force it
// off whenever the cursor actually leaves, and restore it on re-entry.
document.querySelectorAll('.lobby-mode-row').forEach(row => {
    row.addEventListener('mouseleave', () => row.classList.add('cursor-out'));
    row.addEventListener('mouseenter', () => row.classList.remove('cursor-out'));
});

document.getElementById('btn-local').addEventListener('click', () => {
    playSound('Select');
    track('mode_selected', { mode: 'Local' });
    vsAI = false;
    if (softLobby) leaveSoftLobby();
    applyPlayerNames();
    hideLobby();
    trackGameStarted('Local');
});

document.getElementById('btn-ai').addEventListener('click', () => {
    playSound('Select');
    track('mode_selected', { mode: 'AI' });
    vsAI = true;
    aiPlayer = 'p2';
    onlineMode = false;
    onlineRole = null;
    if (softLobby) { softLobby = false; softLobbyRestoreWin = false; }
    document.getElementById('p1-name').textContent = getMyName() || 'You';
    document.getElementById('p2-name').textContent = 'AI';
    setAiAvatars();
    hideLobby();
    resetGame();
    trackGameStarted('AI');
});

document.getElementById('btn-online').addEventListener('click', () => {
    playSound('Select');
    track('mode_selected', { mode: 'Online' });
    showLobbyView('lview-online');
});
document.getElementById('btn-online-back').addEventListener('click', () => {
    playSound('Select');
    showLobbyView('lview-mode');
    if (softLobby) document.getElementById('btn-lobby-back').classList.remove('hidden');
});

document.getElementById('btn-lobby-back').addEventListener('click', () => {
    if (!softLobby) return;
    playSound('Close');
    const restoreWin = softLobbyRestoreWin;
    softLobby = false; softLobbyRestoreWin = false;
    document.getElementById('btn-lobby-back').classList.add('hidden');
    hideLobby();
    if (restoreWin) document.getElementById('win-overlay').classList.remove('hidden');
    // else: game board is already visible behind the lobby
});

document.getElementById('btn-create').addEventListener('click', () => {
    playSound('Select');
    if (softLobby) leaveSoftLobby();
    setConnectingBtn('btn-create');
    initSocket('create-error', () => socket.emit('create-room', { name: getMyName() }));
});

document.getElementById('btn-join').addEventListener('click', () => { playSound('Select'); showLobbyView('lview-join'); syncJoinBtn(); });
document.getElementById('btn-join-back').addEventListener('click', () => { playSound('Select'); showLobbyView('lview-online'); });

document.getElementById('btn-waiting-back').addEventListener('click', () => {
    playSound('Close');
    spectatorMode = false;
    socket?.disconnect(); socket = null;
    showLobbyView('lview-mode');
});

document.getElementById('btn-waiting-ai').addEventListener('click', startFillerAI);
document.getElementById('btn-discord-ai').addEventListener('click', startFillerAI);

// Stop the filler game and return to the invite screen; stays in the room/queue.
document.getElementById('filler-waiting-back').addEventListener('click', () => {
    playSound('Select');
    stopFillerAI();
    showLobby();
    showLobbyView(isDiscord ? 'lview-discord' : 'lview-waiting');
});

document.getElementById('btn-copy-link').addEventListener('click', () => {
    playSound('Jump');
    const code = document.getElementById('room-code-display').textContent;
    const url  = `${location.origin}${location.pathname}?room=${code}`;
    navigator.clipboard.writeText(url).then(() => {
        track('invite_link_copied');
        const label = document.getElementById('copy-btn-label');
        label.textContent = 'Copied!';
        setTimeout(() => { label.textContent = 'Copy Invite Link'; }, 2000);
    });
});


// Win-screen feedback box. Shown after every game for now; the mode/result
// context rides along so suggestions can be sliced by where they came from.
function resetWinFeedback() {
    const input  = document.getElementById('win-feedback-input');
    const send   = document.getElementById('win-feedback-send');
    if (input) input.value = '';
    if (send)  send.disabled = false;
    document.getElementById('win-feedback-form')?.classList.remove('hidden');
    document.getElementById('win-feedback-thanks')?.classList.add('hidden');
}

document.getElementById('win-feedback-send')?.addEventListener('click', () => {
    const input = document.getElementById('win-feedback-input');
    const text  = (input?.value || '').trim();
    if (!text) { input?.focus(); return; }
    track('feedback_submitted', {
        text,
        length: text.length,
        mode:   fillerAI ? 'AI (waiting)' : currentMode(),
    });
    playSound('Select');
    document.getElementById('win-feedback-form')?.classList.add('hidden');
    document.getElementById('win-feedback-thanks')?.classList.remove('hidden');
});

document.getElementById('win-card-close').addEventListener('click', () => {
    playSound('Close');
    document.getElementById('win-overlay').classList.add('hidden');
    if (!spectatorMode) {
        document.getElementById('win-footer-play-again').classList.toggle('hidden', onlineMode);
        document.getElementById('win-footer-rematch').classList.toggle('hidden', !onlineMode);
        document.getElementById('win-footer').classList.remove('hidden');
    }
});

document.getElementById('win-footer-play-again').addEventListener('click', () => {
    document.getElementById('play-again-btn').click();
});

document.getElementById('win-footer-rematch').addEventListener('click', handleRematchClick);
document.getElementById('btn-rematch')?.addEventListener('click', handleRematchClick);

function openSoftLobby(fromWin = false) {
    softLobby           = true;
    softLobbyRestoreWin = fromWin;
    document.getElementById('win-overlay').classList.add('hidden');
    document.getElementById('win-footer').classList.add('hidden');
    showLobby();
    document.getElementById('btn-lobby-back').classList.remove('hidden');
    showLobbyView(isDiscord ? 'lview-discord' : 'lview-mode');
    applyPlayerNames();
    // Socket and game state stay intact until user picks a new mode
}

document.getElementById('btn-change-mode').addEventListener('click', () => {
    playSound('Select');
    openSoftLobby(true);
});

document.getElementById('btn-step-aside').addEventListener('click', () => {
    playSound('Select');
    socket?.emit('step-aside');
});

function spectatorBarBtn(barId, event) {
    return () => { playSound('Select'); document.getElementById(barId).classList.add('hidden'); socket?.emit(event); };
}
document.getElementById('spectator-offer-accept') .addEventListener('click', spectatorBarBtn('spectator-offer-bar', 'accept-spectator'));
document.getElementById('spectator-offer-decline').addEventListener('click', spectatorBarBtn('spectator-offer-bar', 'decline-spectator'));
document.getElementById('spectator-slot-accept')  .addEventListener('click', spectatorBarBtn('spectator-slot-bar',  'accept-spectator'));
document.getElementById('spectator-slot-decline') .addEventListener('click', spectatorBarBtn('spectator-slot-bar',  'decline-spectator'));

// External links inside the Discord activity must go through the SDK; a plain
// target="_blank" is blocked in the sandboxed iframe.
document.querySelectorAll('.lobby-footer .lobby-icon-link').forEach(a => {
    a.addEventListener('click', e => {
        if (isDiscord && discordSdk) {
            e.preventDefault();
            discordSdk.commands.openExternalLink({ url: a.href });
        }
    });
});

document.getElementById('discord-find-match-btn').addEventListener('click', () => {
    playSound('Select');
    document.getElementById('discord-rejoin-bar').classList.add('hidden');
    socket?.emit('join-activity', { instanceId: discordInstanceId, name: getMyName(), avatarUrl: myAvatar });
});

document.getElementById('btn-join-confirm').addEventListener('click', () => {
    const code = document.getElementById('room-code-input').value.trim().toUpperCase();
    if (!code) return;
    playSound('Select');
    if (softLobby) leaveSoftLobby();
    document.getElementById('join-error').classList.add('hidden');
    setConnectingBtn('btn-join-confirm');
    initSocket('join-error', () => socket.emit('join-room', { code, name: getMyName() }));
});

document.getElementById('room-code-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-join-confirm').click();
});

// Only reveal "Join Game" once a code has been entered.
function syncJoinBtn() {
    const code = document.getElementById('room-code-input').value.trim();
    document.getElementById('btn-join-confirm').classList.toggle('hidden', code.length === 0);
}
document.getElementById('room-code-input').addEventListener('input', syncJoinBtn);

// Auto-join if URL contains ?room=CODE (skip in Discord — uses join-activity instead)
const urlRoom = !isDiscord && new URLSearchParams(location.search).get('room');
if (urlRoom) {
    showLobbyView('lview-join');
    document.getElementById('room-code-input').value = urlRoom.toUpperCase();
    syncJoinBtn();
}

['btn-tos', 'btn-privacy'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', e => { e.preventDefault(); openLegal(el.href); });
});
document.getElementById('legal-modal-close').addEventListener('click', closeLegal);
document.getElementById('legal-modal-x').addEventListener('click', closeLegal);
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (resignArmed) { disarmResign(); return; }
    if (!document.getElementById('htp-overlay').classList.contains('hidden')) { closeHTP(); return; }
    closeLegal();
    if (tapPreview || tapMovePreview) { clearTapPreview(); return; }
    if (hoverState.wallRow !== null || hoverState.moveRow !== null) {
        hoverState = EMPTY_HOVER;
        render();
    }
});

// ─── Buttons ──────────────────────────────────────────────────────────────

document.getElementById('play-again-btn').addEventListener('click', () => {
    playSound('Select');
    track('play_again_clicked', { mode: currentMode() });
    if (onlineMode) {
        // In online mode, go back to lobby for a new game (a fresh game_started
        // fires later via the 'game-start' socket event once re-matched).
        onlineMode = false; onlineRole = null; opponentName = ''; opponentAvatar = '';
        socket?.disconnect(); socket = null;
        document.getElementById('win-overlay').classList.add('hidden');
        showLobby();
        showLobbyView(isDiscord ? 'lview-discord' : 'lview-mode');
        resetGame();
    } else if (vsAI) {
        aiPlayer = aiPlayer === 'p1' ? 'p2' : 'p1';
        resetGame();
        triggerAI(); // fires only if AI now goes first (aiPlayer === 'p1')
        // Filler games are not real AI matches: don't fire game_started (it would
        // log a phantom 'AI' start with no completion), just restamp the clock so
        // the filler game_completed reports a correct duration.
        if (fillerAI) clientGameStartedAt = Date.now();
        else trackGameStarted('AI');
    } else {
        resetGame();
        trackGameStarted('Local');
    }
});

// Resign uses a two-step inline confirm: the first click arms the button
// (it morphs to a checkmark with a draining countdown bar); a second click
// within the window resigns. It disarms on timeout, blur, or any other click.
const RESIGN_ARM_MS = 3000;
const resignBtn = document.getElementById('new-game-btn');
const resignLabel = resignBtn.querySelector('.resign-label-text');
let resignArmed = false;
let resignArmTimer = null;

function disarmResign() {
    if (!resignArmed) return;
    resignArmed = false;
    clearTimeout(resignArmTimer);
    resignArmTimer = null;
    resignBtn.classList.remove('armed');
    resignBtn.setAttribute('aria-label', 'Resign');
    resignLabel.textContent = 'Resign';
}

function armResign() {
    resignArmed = true;
    resignBtn.style.setProperty('--resign-arm-ms', `${RESIGN_ARM_MS}ms`);
    // Restart the drain animation cleanly if re-armed in quick succession.
    resignBtn.classList.remove('armed');
    resignBtn.getBoundingClientRect(); // force reflow so the animation replays
    resignBtn.classList.add('armed');
    resignBtn.setAttribute('aria-label', 'Confirm resign');
    resignLabel.textContent = 'Sure?';
    clearTimeout(resignArmTimer);
    resignArmTimer = setTimeout(disarmResign, RESIGN_ARM_MS);
}

resignBtn.addEventListener('click', () => {
    if (spectatorMode || gameState.gameOver) return;
    playSound('Select');
    if (!resignArmed) {
        armResign();
        return;
    }
    disarmResign();
    if (onlineMode) {
        socket?.emit('surrender');
    } else {
        resetGame();
    }
});

// Any click elsewhere, or losing focus, cancels the armed state.
document.addEventListener('click', e => {
    if (resignArmed && !resignBtn.contains(e.target)) disarmResign();
});
resignBtn.addEventListener('blur', disarmResign);

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
    playSound('Select'); // audible only when unmuting (the mute guard silences the other case)
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
    patchUrlMappings([
        { prefix: '/api',  target: 'choridor-web-production.up.railway.app' },
        // PostHog ingestion. Requires a matching URL mapping in the Discord
        // Developer Portal: /phog -> eu.i.posthog.com
        { prefix: '/phog', target: 'eu.i.posthog.com' },
    ]);
    // Now that requests to /phog are proxied out of the sandbox, start analytics.
    initPosthog(`${location.origin}/phog`);
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
        // Tie analytics to a stable per-user id so a player's separate launches
        // merge into one PostHog person. Discord blocks cross-session storage, so
        // the anonymous id resets every launch and retention is otherwise
        // unmeasurable. Namespaced to avoid colliding with web ids.
        if (data.id) {
            discordUserId = String(data.id);
            if (phReady) { try { posthog.identify(`discord:${discordUserId}`); } catch { /* ignore */ } }
        }
        // Server-backed tutorial flag, keyed to the Discord id so it survives the
        // sandbox wiping localStorage between launches. Seed the local flag when
        // the server says they've seen it; htpAuthToken lets closeHTP persist it.
        htpAuthToken = data.htpToken || null;
        if (data.htpSeen) { try { localStorage.setItem(htpKey(), '1'); } catch { /* ignore */ } }
        // Discord proxies all Activity traffic through its own (US) servers, so
        // PostHog GeoIP collapses every Discord player to one location. The user's
        // Discord locale is the only region signal available inside the sandbox;
        // stamp it on every event as a super property so analytics can break down
        // by it. Swallowed so analytics never breaks gameplay.
        try {
            const { locale } = await sdk.commands.userSettingsGetLocale();
            if (locale && phReady) posthog.register({ discord_locale: locale });
        } catch { /* ignore */ }
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
    // If we left the activity mid-game, try to rejoin first; otherwise enter matchmaking.
    initSocket('discord-error', () => {
        const session = getStoredSession();
        if (session) {
            discordRejoinPending = true;
            socket.emit('rejoin-room', session);
            return;
        }
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
    playSound('Close');
    clearTapPreview();
    render();
});

document.addEventListener('keydown', e => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    if (!isMyTurn() || gameState.gameOver) return;
    e.preventDefault();
    if (tapMode) {
        if (tapPreview) {
            const { row, col, orientation } = tapPreview;
            clearTapPreview();
            placeWall(row, col, orientation, false);
        } else if (tapMovePreview) {
            const { row, col } = tapMovePreview;
            clearTapPreview();
            movePawn(row, col);
        }
    } else if (hoverState.wallRow !== null) {
        placeWall(hoverState.wallRow, hoverState.wallCol, hoverState.wallOrientation);
    } else if (hoverState.moveRow !== null) {
        movePawn(hoverState.moveRow, hoverState.moveCol);
    }
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

// ===== How to Play =====
const HTP_KEY = 'choridor_htp_seen';
// Key the "seen" flag to the Discord user so a returning player is not shown the
// tutorial again. On web (no discordUserId) it stays the plain per-device key.
function htpKey() { return discordUserId ? `${HTP_KEY}:${discordUserId}` : HTP_KEY; }
let _htpIdx = 0;
const HTP_TOTAL = 4;

function showHTP(trigger = 'lobby') {
    // trigger: 'auto' (first-visit popup), 'lobby' (link), or 'in_game' (? button).
    track('how_to_play_opened', { trigger });
    document.getElementById('htp-overlay').classList.remove('hidden');
    _htpGoto(0);
}
function closeHTP() {
    if (document.getElementById('htp-overlay').classList.contains('hidden')) return;
    playSound('Close');
    localStorage.setItem(htpKey(), '1');
    // Persist server-side too (Discord only) so it sticks across launches even if
    // the sandbox clears localStorage. Fire-and-forget: the local flag is enough
    // for this session.
    if (isDiscord && htpAuthToken) {
        fetch('/api/htp-seen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: htpAuthToken }),
        }).catch(() => {});
    }
    document.getElementById('htp-overlay').classList.add('hidden');
    _htpIdx = 0;
}
function _htpGoto(idx) {
    _htpIdx = Math.max(0, Math.min(HTP_TOTAL - 1, idx));
    document.querySelectorAll('.htp-slide').forEach((s, i) => s.classList.toggle('active', i === _htpIdx));
    document.querySelectorAll('.htp-dot').forEach((d, i) => d.classList.toggle('active', i === _htpIdx));
    const prev = document.getElementById('htp-prev');
    prev.classList.toggle('htp-hidden', _htpIdx === 0);
    const next = document.getElementById('htp-next');
    next.textContent = _htpIdx === HTP_TOTAL - 1 ? 'Got it!' : 'Next';
}

document.getElementById('htp-close').addEventListener('click', closeHTP);
document.getElementById('htp-prev').addEventListener('click', () => { playSound('Select'); _htpGoto(_htpIdx - 1); });
document.getElementById('htp-next').addEventListener('click', () => {
    if (_htpIdx === HTP_TOTAL - 1) { closeHTP(); return; }
    playSound('Select');
    _htpGoto(_htpIdx + 1);
});
document.querySelectorAll('.htp-dot').forEach(d => d.addEventListener('click', () => { playSound('Select'); _htpGoto(+d.dataset.idx); }));
document.getElementById('htp-btn').addEventListener('click', () => { playSound('Select'); showHTP('in_game'); });
document.getElementById('htp-lobby-btn').addEventListener('click', () => { playSound('Select'); showHTP('lobby'); });
document.getElementById('htp-discord-btn').addEventListener('click', () => { playSound('Select'); showHTP('lobby'); });

// Swipe-to-navigate on the HTP card
{
    let _htpTouchX = null;
    const htpCard = document.querySelector('.htp-card');
    htpCard.addEventListener('touchstart', e => { _htpTouchX = e.touches[0].clientX; }, { passive: true });
    htpCard.addEventListener('touchend', e => {
        if (_htpTouchX === null) return;
        const dx = e.changedTouches[0].clientX - _htpTouchX;
        _htpTouchX = null;
        if (Math.abs(dx) > 40) _htpGoto(_htpIdx + (dx < 0 ? 1 : -1));
    }, { passive: true });
}

// Runs after the Discord auth block above (top-level await), so htpKey() already
// reflects the resolved user id when present.
if (!localStorage.getItem(htpKey())) requestAnimationFrame(() => showHTP('auto'));

// Auto-rejoin on page load / refresh if a session is stored from a live game.
// Skipped on Discord: the SDK re-initialises the socket via join-activity anyway.
{
    const _pageSession = getStoredSession();
    if (_pageSession && !isDiscord) initSocket('', () => socket.emit('rejoin-room', _pageSession));
}

requestAnimationFrame(() => {
    resizeCanvas();
    updateLegalMoves();
    new ResizeObserver(() => { resizeCanvas(); render(); }).observe(canvas.parentElement);
});

// Screenshot automation bridge -- exposes module internals to injected scripts
globalThis.__choridor = {
    get gameState() { return gameState; },
    updateLegalMoves,
    updateWallCounts,
    showWinScreen,
};
