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
    gameOver:      false
};

// ─── Hover state ──────────────────────────────────────────────────────────

let hoverState = { wallRow: null, wallCol: null, wallOrientation: null, moveRow: null, moveCol: null };

// ─── Online state ─────────────────────────────────────────────────────────

let socket     = null;
let onlineRole = null;   // 'p1' | 'p2' | null
let onlineMode = false;

function isMyTurn() {
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
    gameState.walls.forEach(wallKey => {
        const wall  = JSON.parse(wallKey);
        const owner = gameState.wallOwners.get(wallKey);
        ctx.fillStyle = owner === 'p1' ? P1_COLOR : P2_COLOR;
        const x = wall.col * STEP, y = wall.row * STEP;
        if (wall.orientation === 'H') {
            ctx.fillRect(x, y + CELL_SIZE, CELL_SIZE * 2 + GAP, GAP);
        } else {
            ctx.fillRect(x + CELL_SIZE, y, GAP, CELL_SIZE * 2 + GAP);
        }
    });
}

function drawLegalMoves() {
    if (!isMyTurn()) return;
    const color = gameState.currentPlayer === 'p1' ? P1_COLOR : P2_COLOR;

    gameState.legalMoves.forEach(move => {
        const bx = move.col * STEP, by = move.row * STEP;
        const cx = bx + CELL_SIZE / 2, cy = by + CELL_SIZE / 2;
        const isHovered = hoverState.moveRow === move.row && hoverState.moveCol === move.col;

        ctx.fillStyle = color;
        if (isHovered) {
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
    [[gameState.p1Pawn, P1_COLOR], [gameState.p2Pawn, P2_COLOR]].forEach(([pawn, color]) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(pawn.col * STEP + CELL_SIZE / 2, pawn.row * STEP + CELL_SIZE / 2, radius, 0, Math.PI * 2);
        ctx.fill();
    });
}

function drawWallPreview() {
    if (hoverState.wallRow === null || !isMyTurn() || gameState.gameOver) return;
    const cp = gameState.currentPlayer;
    if (cp === 'p1' && gameState.wallCounts.p1 === 0) return;
    if (cp === 'p2' && gameState.wallCounts.p2 === 0) return;
    const { wallRow: row, wallCol: col, wallOrientation: orientation } = hoverState;
    const wallKey = JSON.stringify({ row, col, orientation });
    if (gameState.walls.has(wallKey)) return;
    if (hasWallOverlap(row, col, orientation)) return;
    const tempWalls = gameState.walls;
    gameState.walls = new Set(tempWalls);
    gameState.walls.add(wallKey);
    const valid = bothPlayersHavePath();
    gameState.walls = tempWalls;

    const x = col * STEP, y = row * STEP;
    ctx.fillStyle = cp === 'p1' ? P1_COLOR : P2_COLOR;
    ctx.globalAlpha = valid ? 0.45 : 0.15;
    if (orientation === 'H') ctx.fillRect(x, y + CELL_SIZE, CELL_SIZE * 2 + GAP, GAP);
    else                     ctx.fillRect(x + CELL_SIZE, y, GAP, CELL_SIZE * 2 + GAP);
    ctx.globalAlpha = 1;
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
    if (gameState.gameOver || !isMyTurn()) return;
    const rect = canvas.getBoundingClientRect();
    let x = (e.clientX - rect.left) / boardScale;
    let y = (e.clientY - rect.top)  / boardScale;
    if (gameState.flipped) { x = BOARD_TOTAL - x; y = BOARD_TOTAL - y; }

    const cellX = Math.floor(x / STEP), cellY = Math.floor(y / STEP);
    const offX  = x - cellX * STEP,     offY  = y - cellY * STEP;
    const inHGap = offY >= CELL_SIZE && cellY < BOARD_SIZE - 1;
    const inVGap = offX >= CELL_SIZE && cellX < BOARD_SIZE - 1;

    if (!inHGap && !inVGap) movePawn(cellY, cellX);
    else placeWall(cellY, cellX, inHGap ? 'H' : 'V');
});

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
            const saved = gameState.walls;
            gameState.walls = new Set(saved);
            gameState.walls.add(wk);
            pointer = bothPlayersHavePath();
            gameState.walls = saved;
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

// ─── Moves ────────────────────────────────────────────────────────────────

function movePawn(row, col) {
    if (gameState.gameOver) return;
    if (!gameState.legalMoves.some(m => m.row === row && m.col === col)) return;

    const pawn   = gameState.currentPlayer === 'p1' ? gameState.p1Pawn : gameState.p2Pawn;
    const isJump = Math.abs(row - pawn.row) + Math.abs(col - pawn.col) > 1;

    if (gameState.currentPlayer === 'p1') gameState.p1Pawn = { row, col };
    else                                  gameState.p2Pawn = { row, col };

    playSound(isJump ? 'Jump' : 'Move');
    if (socket && onlineMode) socket.emit('move', { type: 'pawn', row, col });
    if (checkWin()) return;
    gameState.currentPlayer = gameState.currentPlayer === 'p1' ? 'p2' : 'p1';
    updateStatus();
    updateLegalMoves();
}

function placeWall(row, col, orientation) {
    if (gameState.gameOver) return;
    if (gameState.currentPlayer === 'p1' && gameState.wallCounts.p1 === 0) return;
    if (gameState.currentPlayer === 'p2' && gameState.wallCounts.p2 === 0) return;

    const wallKey = JSON.stringify({ row, col, orientation });
    if (gameState.walls.has(wallKey) || hasWallOverlap(row, col, orientation)) return;

    gameState.walls.add(wallKey);
    if (!bothPlayersHavePath()) { gameState.walls.delete(wallKey); return; }

    gameState.wallOwners.set(wallKey, gameState.currentPlayer);
    if (gameState.currentPlayer === 'p1') gameState.wallCounts.p1--;
    else                                  gameState.wallCounts.p2--;

    playSound('Wall');
    if (socket && onlineMode) socket.emit('move', { type: 'wall', row, col, orientation });
    gameState.currentPlayer = gameState.currentPlayer === 'p1' ? 'p2' : 'p1';
    updateWallCounts();
    updateStatus();
    updateLegalMoves();
}

function applyOpponentPawnMove(data) {
    const pawn   = gameState.currentPlayer === 'p1' ? gameState.p1Pawn : gameState.p2Pawn;
    const isJump = Math.abs(data.row - pawn.row) + Math.abs(data.col - pawn.col) > 1;
    if (gameState.currentPlayer === 'p1') gameState.p1Pawn = { row: data.row, col: data.col };
    else                                  gameState.p2Pawn = { row: data.row, col: data.col };
    playSound(isJump ? 'Jump' : 'Move');
    if (checkWin()) return;
    gameState.currentPlayer = gameState.currentPlayer === 'p1' ? 'p2' : 'p1';
    updateStatus();
    updateLegalMoves();
}

function applyOpponentWallMove(data) {
    const wallKey = JSON.stringify({ row: data.row, col: data.col, orientation: data.orientation });
    gameState.walls.add(wallKey);
    gameState.wallOwners.set(wallKey, gameState.currentPlayer);
    if (gameState.currentPlayer === 'p1') gameState.wallCounts.p1--;
    else                                  gameState.wallCounts.p2--;
    playSound('Wall');
    gameState.currentPlayer = gameState.currentPlayer === 'p1' ? 'p2' : 'p1';
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

function updateStatus() {
    const status = document.getElementById('status');
    if (onlineMode) {
        const myTurn = isMyTurn();
        status.textContent = myTurn ? 'Your turn' : "Opponent's turn";
        status.className   = `status-label ${gameState.currentPlayer}`;
    } else {
        const name = gameState.currentPlayer === 'p1'
            ? document.getElementById('p1-name').textContent
            : document.getElementById('p2-name').textContent;
        status.textContent = `${name}'s Turn`;
        status.className   = `status-label ${gameState.currentPlayer}`;
    }
}

function checkWin() {
    if (gameState.p1Pawn.row === 0) {
        showWinScreen(document.getElementById('p1-name').textContent, 'p1');
        return true;
    }
    if (gameState.p2Pawn.row === BOARD_SIZE - 1) {
        showWinScreen(document.getElementById('p2-name').textContent, 'p2');
        return true;
    }
    return false;
}

function showWinScreen(winner, playerClass) {
    gameState.gameOver = true;
    playSound('Win');
    document.getElementById('win-card').className  = `win-card ${playerClass}`;
    document.getElementById('win-pawn').className  = `win-pawn ${playerClass}`;
    const msg = document.getElementById('win-message');
    msg.textContent = `${winner} Wins!`;
    msg.className   = `win-title ${playerClass}`;

    const card = document.getElementById('win-card');
    card.style.animation = 'none';
    card.getBoundingClientRect();
    card.style.animation = '';

    document.getElementById('win-overlay').classList.remove('hidden');
}

function resetGame() {
    gameState = {
        p1Pawn:        { row: 8, col: 4 },
        p2Pawn:        { row: 0, col: 4 },
        walls:         new Set(),
        wallOwners:    new Map(),
        wallCounts:    { p1: WALLS_PER_PLAYER, p2: WALLS_PER_PLAYER },
        currentPlayer: 'p1',
        legalMoves:    [],
        flipped:       onlineMode ? onlineRole === 'p2' : gameState.flipped,
        gameOver:      false
    };
    document.getElementById('win-overlay').classList.add('hidden');
    updateWallCounts();
    updateStatus();
    updateLegalMoves();
}

// ─── Online: socket setup ─────────────────────────────────────────────────

function initSocket(errorElId, callback) {
    if (socket?.connected) { callback(); return; }
    if (socket) { socket.disconnect(); socket = null; }

    socket = io(BACKEND_URL, { path: SOCKET_PATH, transports: ['websocket', 'polling'] });

    const timeout = setTimeout(() => {
        if (!socket?.connected) {
            showLobbyError(errorElId, 'Could not connect to server');
            socket?.disconnect();
            socket = null;
        }
    }, 4000);

    socket.once('connect', () => {
        clearTimeout(timeout);
        callback();
    });

    socket.on('connect_error', () => {
        clearTimeout(timeout);
        showLobbyError(errorElId, 'Could not connect to server');
        socket?.disconnect();
        socket = null;
    });

    socket.on('room-created', ({ code }) => {
        onlineRole = 'p1';
        document.getElementById('room-code-display').textContent = code;
        showLobbyView('lview-waiting');
    });

    socket.on('room-joined', () => { onlineRole = 'p2'; });

    socket.on('game-start', () => {
        onlineMode = true;
        hideLobby();
        applyPlayerNames();
        resetGame();
    });

    socket.on('opponent-move', data => applyOpponentMove(data));

    socket.on('room-error', msg => showLobbyError(errorElId, msg));

    socket.on('opponent-left', () => {
        onlineMode  = false;
        gameState.gameOver = true;
        const s = document.getElementById('status');
        s.textContent = 'Opponent disconnected';
        s.className   = 'status-label';
    });

    callback();
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

function applyPlayerNames() {
    const name = getMyName();
    if (onlineMode) {
        if (onlineRole === 'p1') {
            document.getElementById('p1-name').textContent = name || 'Player 1';
            document.getElementById('p2-name').textContent = 'Opponent';
        } else {
            document.getElementById('p1-name').textContent = 'Opponent';
            document.getElementById('p2-name').textContent = name || 'Player 2';
        }
    } else {
        document.getElementById('p1-name').textContent = name || 'Player 1';
        document.getElementById('p2-name').textContent = 'Player 2';
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

document.getElementById('btn-local').addEventListener('click', () => { playSound('Select'); applyPlayerNames(); hideLobby(); });

document.getElementById('btn-online').addEventListener('click', () => { playSound('Select'); showLobbyView('lview-online'); });
document.getElementById('btn-online-back').addEventListener('click', () => { playSound('Select'); showLobbyView('lview-mode'); });

document.getElementById('btn-create').addEventListener('click', () => {
    playSound('Select');
    initSocket('create-error', () => socket.emit('create-room'));
});

document.getElementById('btn-join').addEventListener('click', () => { playSound('Select'); showLobbyView('lview-join'); });
document.getElementById('btn-join-back').addEventListener('click', () => { playSound('Select'); showLobbyView('lview-online'); });

document.getElementById('btn-waiting-back').addEventListener('click', () => {
    playSound('Select');
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

document.getElementById('btn-join-confirm').addEventListener('click', () => {
    const code = document.getElementById('room-code-input').value.trim().toUpperCase();
    if (!code) return;
    playSound('Select');
    document.getElementById('join-error').classList.add('hidden');
    initSocket('join-error', () => socket.emit('join-room', code));
});

document.getElementById('room-code-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-join-confirm').click();
});

// Auto-join if URL contains ?room=CODE
const urlRoom = new URLSearchParams(location.search).get('room');
if (urlRoom) {
    showLobbyView('lview-join');
    document.getElementById('room-code-input').value = urlRoom.toUpperCase();
}

// ─── Buttons ──────────────────────────────────────────────────────────────

document.getElementById('play-again-btn').addEventListener('click', () => {
    playSound('Select');
    if (onlineMode) {
        // In online mode, go back to lobby for a new game
        onlineMode = false; onlineRole = null;
        socket?.disconnect(); socket = null;
        document.getElementById('win-overlay').classList.add('hidden');
        document.getElementById('lobby-overlay').classList.remove('hidden');
        showLobbyView('lview-mode');
        resetGame();
    } else {
        resetGame();
    }
});

document.getElementById('new-game-btn').addEventListener('click', () => {
    playSound('Select');
    if (onlineMode) {
        onlineMode = false; onlineRole = null;
        socket?.disconnect(); socket = null;
        document.getElementById('win-overlay').classList.add('hidden');
        document.getElementById('lobby-overlay').classList.remove('hidden');
        showLobbyView('lview-mode');
    }
    resetGame();
});

document.getElementById('flip-btn').addEventListener('click', () => {
    gameState.flipped = !gameState.flipped;
    render();
});

document.getElementById('mute-btn').addEventListener('click', () => {
    muted = !muted;
    document.getElementById('mute-icon').innerHTML = muted
        ? `<path d="M11 5 6 9H2v6h4l5 4V5z"/>
           <line x1="23" y1="9" x2="17" y2="15"/>
           <line x1="17" y1="9" x2="23" y2="15"/>`
        : `<path d="M11 5 6 9H2v6h4l5 4V5z"/>
           <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
           <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>`;
});

document.getElementById('change-mode-btn').addEventListener('click', () => {
    playSound('Select');
    onlineMode = false; onlineRole = null;
    socket?.disconnect(); socket = null;
    document.getElementById('win-overlay').classList.add('hidden');
    document.getElementById('lobby-overlay').classList.remove('hidden');
    showLobbyView('lview-mode');
    applyPlayerNames();
    resetGame();
});

// ─── Discord Activity ─────────────────────────────────────────────────────

try {
    const { DiscordSDK } = await import('https://esm.sh/@discord/embedded-app-sdk@1');
    const sdk = new DiscordSDK('1515199692793843712');
    await sdk.ready();
    sdk.patchUrlMappings([{
        prefix: '/api',
        target: 'choridor-web-production.up.railway.app',
        sandboxed: false,
        targetApplicationId: null
    }]);
} catch { /* not in Discord, or SDK unavailable */ }

// ─── Init ─────────────────────────────────────────────────────────────────

buildWallBoxes();
updateWallCounts();
updateStatus();

requestAnimationFrame(() => {
    resizeCanvas();
    updateLegalMoves();
    new ResizeObserver(() => { resizeCanvas(); render(); }).observe(canvas.parentElement);
});
