const BOARD_SIZE = 9;
const WIN = 4 * BOARD_SIZE * BOARD_SIZE + 1; // 325 — exceeds any heuristic score
const DEFAULT_DEPTH = 2;
const TIME_LIMIT_MS = 1500;
const WALL_RESERVE_WEIGHT = 1;
const DIRS = [[-1,0],[1,0],[0,-1],[0,1]];

// Set per-request in onmessage; safe because the worker is single-threaded
let AI  = 'p2';
let OPP = 'p1';

// Compact wall key: "H3,4" or "V3,4"
function wk(row, col, o) { return `${o}${row},${col}`; }

function hasWall(walls, o, row, col) { return walls.has(wk(row, col, o)); }

function inBounds(r, c) { return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE; }

function isEdgeBlocked(walls, from, to) {
    const dc = to.col - from.col;
    if (dc === 0) {
        const er = Math.min(from.row, to.row);
        return hasWall(walls, 'H', er, from.col) || hasWall(walls, 'H', er, from.col - 1);
    }
    const ec = Math.min(from.col, to.col);
    return hasWall(walls, 'V', from.row, ec) || hasWall(walls, 'V', from.row - 1, ec);
}

function bfsEnqueue(visited, next, row, col) {
    const idx = row * BOARD_SIZE + col;
    if (!visited[idx]) { visited[idx] = 1; next.push({row, col}); }
}

// Handle jump-over-opponent in BFS; returns true if goalRow reached
function bfsJumps(walls, visited, next, opp, dr, dc, goalRow) {
    const sr = opp.row + dr, sc = opp.col + dc;
    if (sr >= 0 && sr < BOARD_SIZE && sc >= 0 && sc < BOARD_SIZE &&
        !isEdgeBlocked(walls, opp, {row: sr, col: sc})) {
        if (sr === goalRow) return true;
        bfsEnqueue(visited, next, sr, sc);
        return false;
    }
    for (const [pd, qd] of DIRS) {
        if ((pd === dr && qd === dc) || (pd === -dr && qd === -dc)) continue;
        const r2 = opp.row + pd, c2 = opp.col + qd;
        if (r2 < 0 || r2 >= BOARD_SIZE || c2 < 0 || c2 >= BOARD_SIZE) continue;
        if (isEdgeBlocked(walls, opp, {row: r2, col: c2})) continue;
        if (r2 === goalRow) return true;
        bfsEnqueue(visited, next, r2, c2);
    }
    return false;
}

// Process one BFS cell; returns true if goalRow is reached
function bfsStep(state, visited, next, cur, opp, goalRow) {
    for (const [dr, dc] of DIRS) {
        const nr = cur.row + dr, nc = cur.col + dc;
        if (!inBounds(nr, nc) || isEdgeBlocked(state.walls, cur, {row: nr, col: nc})) continue;
        if (nr === opp.row && nc === opp.col) {
            if (bfsJumps(state.walls, visited, next, opp, dr, dc, goalRow)) return true;
        } else {
            if (nr === goalRow) return true;
            bfsEnqueue(visited, next, nr, nc);
        }
    }
    return false;
}

// BFS shortest path to goal row, respecting jump-over-opponent rule
function bfsDist(state, player) {
    const pos = player === 'p1' ? state.p1 : state.p2;
    const opp = player === 'p1' ? state.p2 : state.p1;
    const goalRow = player === 'p1' ? 0 : BOARD_SIZE - 1;
    if (pos.row === goalRow) return 0;
    const visited = new Uint8Array(BOARD_SIZE * BOARD_SIZE);
    visited[pos.row * BOARD_SIZE + pos.col] = 1;
    let queue = [pos];
    let dist = 0;
    while (queue.length > 0) {
        dist++;
        const next = [];
        for (const cur of queue) {
            if (bfsStep(state, visited, next, cur, opp, goalRow)) return dist;
        }
        queue = next;
    }
    return Infinity;
}

function hasPathStep(walls, visited, next, cur, goalRow) {
    for (const [dr, dc] of DIRS) {
        const nr = cur.row + dr, nc = cur.col + dc;
        if (!inBounds(nr, nc) || isEdgeBlocked(walls, cur, {row: nr, col: nc})) continue;
        if (nr === goalRow) return true;
        bfsEnqueue(visited, next, nr, nc);
    }
    return false;
}

// Simple BFS (no jumps) for wall legality check — faster, position-independent
function hasPath(walls, start, goalRow) {
    if (start.row === goalRow) return true;
    const visited = new Uint8Array(BOARD_SIZE * BOARD_SIZE);
    visited[start.row * BOARD_SIZE + start.col] = 1;
    let queue = [start];
    while (queue.length > 0) {
        const next = [];
        for (const cur of queue) {
            if (hasPathStep(walls, visited, next, cur, goalRow)) return true;
        }
        queue = next;
    }
    return false;
}

// Add jump-over-opponent moves to the moves array
function pawnJumps(state, opp, dr, dc, moves) {
    const sr = opp.row + dr, sc = opp.col + dc;
    if (sr >= 0 && sr < BOARD_SIZE && sc >= 0 && sc < BOARD_SIZE &&
        !isEdgeBlocked(state.walls, opp, {row: sr, col: sc})) {
        moves.push({type: 'pawn', row: sr, col: sc});
        return;
    }
    for (const [pd, qd] of DIRS) {
        if ((pd === dr && qd === dc) || (pd === -dr && qd === -dc)) continue;
        const r2 = opp.row + pd, c2 = opp.col + qd;
        if (r2 < 0 || r2 >= BOARD_SIZE || c2 < 0 || c2 >= BOARD_SIZE) continue;
        if (!isEdgeBlocked(state.walls, opp, {row: r2, col: c2})) {
            moves.push({type: 'pawn', row: r2, col: c2});
        }
    }
}

function getPawnMoves(state) {
    const mover = state.current;
    const pos = mover === 'p1' ? state.p1 : state.p2;
    const opp = mover === 'p1' ? state.p2 : state.p1;
    const moves = [];
    for (const [dr, dc] of DIRS) {
        const nr = pos.row + dr, nc = pos.col + dc;
        if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) continue;
        if (isEdgeBlocked(state.walls, pos, {row: nr, col: nc})) continue;
        if (nr === opp.row && nc === opp.col) {
            pawnJumps(state, opp, dr, dc, moves);
        } else {
            moves.push({type: 'pawn', row: nr, col: nc});
        }
    }
    return moves;
}

function wallConflicts(walls, o, r, c) {
    if (o === 'H') return hasWall(walls,'H',r,c-1) || hasWall(walls,'H',r,c+1) || hasWall(walls,'V',r,c);
    return hasWall(walls,'V',r-1,c) || hasWall(walls,'V',r+1,c) || hasWall(walls,'H',r,c);
}

function isValidWallPlacement(state, r, c, o) {
    if (state.walls.has(wk(r, c, o)) || wallConflicts(state.walls, o, r, c)) return false;
    const testWalls = new Set(state.walls);
    testWalls.add(wk(r, c, o));
    return hasPath(testWalls, state.p1, 0) && hasPath(testWalls, state.p2, BOARD_SIZE - 1);
}

function getWallMoves(state) {
    const mover = state.current;
    if (state.wc[mover] <= 0) return [];
    const moves = [];
    const MAX = BOARD_SIZE - 2;
    for (const o of ['H', 'V']) {
        for (let r = 0; r <= MAX; r++) {
            for (let c = 0; c <= MAX; c++) {
                if (isValidWallPlacement(state, r, c, o)) {
                    moves.push({type: 'wall', row: r, col: c, orientation: o});
                }
            }
        }
    }
    return moves;
}

function candidates(state) {
    return [...getPawnMoves(state), ...getWallMoves(state)];
}

function applyMove(state, move) {
    const next = {
        p1: state.p1, p2: state.p2,
        walls: state.walls,
        wc: state.wc,
        current: state.current === 'p1' ? 'p2' : 'p1',
    };
    if (move.type === 'pawn') {
        if (state.current === 'p1') next.p1 = {row: move.row, col: move.col};
        else next.p2 = {row: move.row, col: move.col};
    } else {
        const w2 = new Set(state.walls);
        w2.add(wk(move.row, move.col, move.orientation));
        next.walls = w2;
        next.wc = {...state.wc, [state.current]: state.wc[state.current] - 1};
    }
    return next;
}

// Positive score favours the AI player
function heuristic(state, myDist, oppDist) {
    return (oppDist - myDist) + WALL_RESERVE_WEIGHT * (state.wc[AI] - state.wc[OPP]);
}

function evaluate(state) {
    const myDist  = bfsDist(state, AI);
    const oppDist = bfsDist(state, OPP);
    if (myDist  === 0)        return  WIN;
    if (oppDist === 0)        return -WIN;
    if (myDist  === Infinity) return -WIN;
    if (oppDist === Infinity) return  WIN;
    return heuristic(state, myDist, oppDist);
}

// Sort: pawn moves first, then order by row proximity to mover's goal
function rowProgressOrder(state) {
    const goalRow = state.current === 'p1' ? 0 : BOARD_SIZE - 1;
    return (a, b) => {
        const ap = a.type === 'pawn';
        if (ap !== (b.type === 'pawn')) return ap ? -1 : 1;
        if (!ap) return 0;
        return Math.abs(a.row - goalRow) - Math.abs(b.row - goalRow);
    };
}

function updateAlphaBeta(maximizing, v, best, alpha, beta) {
    if (maximizing) {
        if (v > best) best = v;
        if (best > alpha) alpha = best;
    } else {
        if (v < best) best = v;
        if (best < beta) beta = best;
    }
    return [best, alpha, beta];
}

function minimax(state, depth, alpha, beta, maximizing, deadline) {
    const s = evaluate(state);
    if (Math.abs(s) >= WIN) return s > 0 ? s + depth : s - depth;
    if (depth === 0 || Date.now() >= deadline) return s;
    const moves = candidates(state);
    moves.sort(rowProgressOrder(state));
    let best = maximizing ? -Infinity : Infinity;
    for (const m of moves) {
        const v = minimax(applyMove(state, m), depth - 1, alpha, beta, !maximizing, deadline);
        [best, alpha, beta] = updateAlphaBeta(maximizing, v, best, alpha, beta);
        if (beta <= alpha) break;
    }
    return best;
}

// Fast-path: if AI is winning the race, just advance the pawn
function racingMove(state, moves) {
    const myDist  = bfsDist(state, AI);
    const oppDist = bfsDist(state, OPP);
    if (myDist <= 0 || myDist >= oppDist) return null;
    let best = null, bestDist = myDist;
    for (const m of moves) {
        if (m.type !== 'pawn') continue;
        const d = bfsDist(applyMove(state, m), AI);
        if (d < bestDist) { bestDist = d; best = m; }
    }
    return best;
}

function isBetterMove(s, myDist, oppDist, bestScore, bestMyDist, bestOppDist) {
    if (s > bestScore) return true;
    if (s === bestScore && myDist < bestMyDist) return true;
    return s === bestScore && myDist === bestMyDist && oppDist > bestOppDist;
}

function decide(state) {
    const deadline = Date.now() + TIME_LIMIT_MS;
    const moves = candidates(state);
    if (moves.length === 0) return null;

    const racing = racingMove(state, moves);
    if (racing) return racing;

    // Root sort by BFS progress for better alpha-beta pruning
    moves.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'pawn' ? -1 : 1;
        if (a.type !== 'pawn') return 0;
        return bfsDist(applyMove(state, a), AI) - bfsDist(applyMove(state, b), AI);
    });

    let best = moves[0];
    for (let depth = 1; depth <= DEFAULT_DEPTH; depth++) {
        if (Date.now() >= deadline) break;
        let bestScore = -Infinity, bestMyDist = Infinity, bestOppDist = -Infinity, candidate = null;
        for (const move of moves) {
            if (Date.now() >= deadline) break;
            const next = applyMove(state, move);
            const s = minimax(next, depth - 1, -Infinity, Infinity, false, deadline);
            const myDist  = bfsDist(next, AI);
            const oppDist = bfsDist(next, OPP);
            if (isBetterMove(s, myDist, oppDist, bestScore, bestMyDist, bestOppDist)) {
                bestScore = s; bestMyDist = myDist; bestOppDist = oppDist; candidate = move;
            }
        }
        if (candidate) best = candidate;
    }
    return best;
}

globalThis.onmessage = function(e) {
    const { state, aiPlayer } = e.data;
    AI  = aiPlayer || 'p2';
    OPP = AI === 'p1' ? 'p2' : 'p1';
    const walls = new Set(state.walls.map(w => wk(w.row, w.col, w.orientation)));
    const aiState = { p1: state.p1, p2: state.p2, walls, wc: state.wc, current: AI };
    const move = decide(aiState);
    globalThis.postMessage({ move });
};
