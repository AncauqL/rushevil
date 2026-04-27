export const TURN = {
  SETUP: "setup",
  DEVIL: "devil",
  ANGEL: "angel",
  ANGEL_WON: "angel-won",
  DEVIL_WON: "devil-won",
};

const keyOf = (x, y) => `${x},${y}`;

export const DEFAULT_RULES = {
  boardRadius: 20,
  escapeRadius: 22,
  maxAngelMoves: 32,
  blocksPerDevilTurn: 2,
  forbidBacktracking: true,
};

const cloneState = (state) => ({
  power: state.power,
  rules: { ...state.rules },
  turn: state.turn,
  angel: { ...state.angel },
  previousAngel: state.previousAngel ? { ...state.previousAngel } : null,
  angelMoves: state.angelMoves,
  devilBlocksThisTurn: state.devilBlocksThisTurn,
  blocks: new Set(state.blocks),
  history: state.history.map((entry) => ({
    ...entry,
    angel: entry.angel ? { ...entry.angel } : undefined,
    previousAngel: entry.previousAngel ? { ...entry.previousAngel } : undefined,
  })),
});

export function createGame(power = 1, rules = {}) {
  return {
    power: normalizePower(power),
    rules: normalizeRules(rules),
    turn: TURN.DEVIL,
    angel: { x: 0, y: 0 },
    previousAngel: null,
    angelMoves: 0,
    devilBlocksThisTurn: 0,
    blocks: new Set(),
    history: [],
  };
}

export function normalizePower(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return 1;
  return Math.max(1, Math.min(12, parsed));
}

export function normalizeRules(rules = {}) {
  const boardRadius = clampInteger(rules.boardRadius, DEFAULT_RULES.boardRadius, 8, 36);
  const escapeRadius = clampInteger(rules.escapeRadius, DEFAULT_RULES.escapeRadius, 4, 50);
  const maxAngelMoves = clampInteger(rules.maxAngelMoves, DEFAULT_RULES.maxAngelMoves, 10, 100);
  const blocksPerDevilTurn = clampInteger(rules.blocksPerDevilTurn, DEFAULT_RULES.blocksPerDevilTurn, 1, 6);
  const forbidBacktracking = rules.forbidBacktracking ?? DEFAULT_RULES.forbidBacktracking;
  return { boardRadius, escapeRadius, maxAngelMoves, blocksPerDevilTurn, forbidBacktracking };
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function isBlocked(state, x, y) {
  return state.blocks.has(keyOf(x, y));
}

export function sameCell(a, b) {
  return a.x === b.x && a.y === b.y;
}

export function distanceForAngel(from, to) {
  return Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y));
}

export function distanceFromStart(cell) {
  return Math.max(Math.abs(cell.x), Math.abs(cell.y));
}

export function isInBounds(state, cell) {
  return Math.abs(cell.x) <= state.rules.boardRadius && Math.abs(cell.y) <= state.rules.boardRadius;
}

export function isInMovementArea(state, cell) {
  const radius = Math.max(state.rules.boardRadius, state.rules.escapeRadius);
  return Math.abs(cell.x) <= radius && Math.abs(cell.y) <= radius;
}

export function hasEscaped(state) {
  return distanceFromStart(state.angel) >= state.rules.escapeRadius;
}

export function canPlaceBlock(state, cell) {
  return state.turn === TURN.DEVIL && isInBounds(state, cell) && !sameCell(state.angel, cell) && !isBlocked(state, cell.x, cell.y);
}

export function canMoveAngel(state, cell) {
  if (state.turn !== TURN.ANGEL) return false;
  if (!isInMovementArea(state, cell)) return false;
  if (sameCell(state.angel, cell)) return false;
  if (state.rules.forbidBacktracking && state.previousAngel && sameCell(state.previousAngel, cell)) return false;
  if (isBlocked(state, cell.x, cell.y)) return false;
  const distance = distanceForAngel(state.angel, cell);
  return distance > 0 && distance <= state.power;
}

export function placeBlock(state, cell) {
  if (!canPlaceBlock(state, cell)) {
    return { state, ok: false, reason: "这里不能放置路障。" };
  }

  const next = cloneState(state);
  next.history.push({ type: "block", cell: { ...cell }, devilBlocksThisTurn: state.devilBlocksThisTurn });
  next.blocks.add(keyOf(cell.x, cell.y));
  next.devilBlocksThisTurn += 1;
  if (!hasAnyAngelMove(next)) {
    next.turn = TURN.DEVIL_WON;
  } else if (next.devilBlocksThisTurn >= next.rules.blocksPerDevilTurn) {
    next.devilBlocksThisTurn = 0;
    next.turn = TURN.ANGEL;
  } else {
    next.turn = TURN.DEVIL;
  }
  return { state: next, ok: true };
}

export function moveAngel(state, cell) {
  if (!canMoveAngel(state, cell)) {
    return { state, ok: false, reason: "天使不能移动到这里。" };
  }

  const next = cloneState(state);
  next.history.push({
    type: "angel",
    angel: { ...state.angel },
    previousAngel: state.previousAngel ? { ...state.previousAngel } : null,
    angelMoves: state.angelMoves,
    to: { ...cell },
  });
  next.previousAngel = { ...state.angel };
  next.angel = { ...cell };
  next.angelMoves += 1;
  next.devilBlocksThisTurn = 0;
  next.turn = hasEscaped(next) || next.angelMoves >= next.rules.maxAngelMoves ? TURN.ANGEL_WON : TURN.DEVIL;
  return { state: next, ok: true };
}

export function undo(state) {
  if (!state.history.length) return state;

  const next = cloneState(state);
  const last = next.history.pop();

  if (last.type === "block") {
    next.blocks.delete(keyOf(last.cell.x, last.cell.y));
    next.devilBlocksThisTurn = last.devilBlocksThisTurn;
    next.turn = TURN.DEVIL;
  }

  if (last.type === "angel") {
    next.angel = { ...last.angel };
    next.previousAngel = last.previousAngel ? { ...last.previousAngel } : null;
    next.angelMoves = last.angelMoves;
    next.turn = TURN.ANGEL;
  }

  return next;
}

export function hasAnyAngelMove(state) {
  for (let dx = -state.power; dx <= state.power; dx += 1) {
    for (let dy = -state.power; dy <= state.power; dy += 1) {
      if (dx === 0 && dy === 0) continue;
      const cell = { x: state.angel.x + dx, y: state.angel.y + dy };
      if (canMoveAngel({ ...state, turn: TURN.ANGEL }, cell)) return true;
    }
  }
  return false;
}

export function legalAngelCells(state) {
  const cells = [];
  for (let dx = -state.power; dx <= state.power; dx += 1) {
    for (let dy = -state.power; dy <= state.power; dy += 1) {
      if (dx === 0 && dy === 0) continue;
      const cell = { x: state.angel.x + dx, y: state.angel.y + dy };
      if (canMoveAngel(state, cell)) cells.push(cell);
    }
  }
  return cells;
}

export function serializeState(state) {
  return {
    power: state.power,
    rules: state.rules,
    turn: state.turn,
    angel: state.angel,
    previousAngel: state.previousAngel,
    angelMoves: state.angelMoves,
    devilBlocksThisTurn: state.devilBlocksThisTurn,
    blocks: [...state.blocks],
  };
}
