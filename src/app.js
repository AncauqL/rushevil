import {
  DEFAULT_RULES,
  TURN,
  canMoveAngel,
  canPlaceBlock,
  createGame,
  distanceFromStart,
  isBlocked,
  legalAngelCells,
  moveAngel,
  normalizePower,
  normalizeRules,
  placeBlock,
  undo,
} from "./game.js";

const canvas = document.querySelector("#board");
const ctx = canvas.getContext("2d");
const powerInput = document.querySelector("#powerInput");
const escapeInput = document.querySelector("#escapeInput");
const maxMovesInput = document.querySelector("#maxMovesInput");
const boardRadiusInput = document.querySelector("#boardRadiusInput");
const blocksPerTurnInput = document.querySelector("#blocksPerTurnInput");
const powerLabel = document.querySelector("#powerLabel");
const turnLabel = document.querySelector("#turnLabel");
const blockCount = document.querySelector("#blockCount");
const blockQuota = document.querySelector("#blockQuota");
const escapeProgress = document.querySelector("#escapeProgress");
const moveProgress = document.querySelector("#moveProgress");
const messagePanel = document.querySelector("#messagePanel");
const startGameButton = document.querySelector("#startGame");
const resetGameButton = document.querySelector("#resetGame");
const undoButton = document.querySelector("#undoMove");
const createRoomButton = document.querySelector("#createRoom");
const joinRoomButton = document.querySelector("#joinRoom");
const roomCodeInput = document.querySelector("#roomCodeInput");
const onlineStatus = document.querySelector("#onlineStatus");
const roomCodeLabel = document.querySelector("#roomCodeLabel");
const zoomInButton = document.querySelector("#zoomIn");
const zoomOutButton = document.querySelector("#zoomOut");
const centerAngelButton = document.querySelector("#centerAngel");

const palette = {
  ink: "#17202a",
  grid: "#d6dde5",
  axis: "#a6b3c1",
  land: "#f7f9fb",
  out: "rgba(37, 45, 55, 0.08)",
  escape: "rgba(58, 157, 111, 0.16)",
  escapeBorder: "#3a9d6f",
  highlight: "rgba(67, 137, 214, 0.22)",
  highlightBorder: "#4389d6",
  block: "#33343a",
  blockTop: "#50525b",
  angel: "#f6c44f",
  angelCore: "#ffffff",
  devil: "#d44c48",
};

let state = createGame(normalizePower(powerInput.value), DEFAULT_RULES);
let camera = { x: 0, y: 0, cellSize: 48 };
let hoverCell = null;
let isPanning = false;
let panStart = null;
let dragMoved = false;
let online = {
  enabled: false,
  roomId: null,
  playerId: null,
  role: null,
  version: 0,
  pollTimer: null,
};
const onlineStorageKey = "angel-devil-online-session";

const roomFromUrl = new URLSearchParams(window.location.search).get("room");
if (roomFromUrl) roomCodeInput.value = roomFromUrl.toUpperCase();

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * scale));
  canvas.height = Math.max(1, Math.floor(rect.height * scale));
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  draw();
}

function worldToScreen(cell) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: rect.width / 2 + (cell.x - camera.x) * camera.cellSize,
    y: rect.height / 2 + (cell.y - camera.y) * camera.cellSize,
  };
}

function screenToWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left - rect.width / 2) / camera.cellSize + camera.x;
  const y = (clientY - rect.top - rect.height / 2) / camera.cellSize + camera.y;
  return { x: Math.floor(x + 0.5), y: Math.floor(y + 0.5) };
}

function visibleBounds() {
  const rect = canvas.getBoundingClientRect();
  const halfCols = Math.ceil(rect.width / camera.cellSize / 2) + 2;
  const halfRows = Math.ceil(rect.height / camera.cellSize / 2) + 2;
  return {
    minX: Math.floor(camera.x - halfCols),
    maxX: Math.ceil(camera.x + halfCols),
    minY: Math.floor(camera.y - halfRows),
    maxY: Math.ceil(camera.y + halfRows),
  };
}

function drawGrid() {
  const rect = canvas.getBoundingClientRect();
  const bounds = visibleBounds();
  ctx.fillStyle = palette.land;
  ctx.fillRect(0, 0, rect.width, rect.height);

  ctx.lineWidth = 1;
  for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
    const screen = worldToScreen({ x, y: 0 });
    ctx.strokeStyle = x === 0 ? palette.axis : palette.grid;
    ctx.beginPath();
    ctx.moveTo(screen.x, 0);
    ctx.lineTo(screen.x, rect.height);
    ctx.stroke();
  }

  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    const screen = worldToScreen({ x: 0, y });
    ctx.strokeStyle = y === 0 ? palette.axis : palette.grid;
    ctx.beginPath();
    ctx.moveTo(0, screen.y);
    ctx.lineTo(rect.width, screen.y);
    ctx.stroke();
  }
}

function drawWorldRect(minX, maxX, minY, maxY, fill = null, stroke = null) {
  const topLeft = worldToScreen({ x: minX - 0.5, y: minY - 0.5 });
  const bottomRight = worldToScreen({ x: maxX + 0.5, y: maxY + 0.5 });
  const x = topLeft.x;
  const y = topLeft.y;
  const width = bottomRight.x - topLeft.x;
  const height = bottomRight.y - topLeft.y;

  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, width, height);
  }

  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);
  }
}

function drawArena() {
  const { boardRadius, escapeRadius } = state.rules;
  const outerRadius = Math.max(boardRadius, escapeRadius);
  drawGrid();

  const rect = canvas.getBoundingClientRect();
  const topLeft = worldToScreen({ x: -boardRadius - 0.5, y: -boardRadius - 0.5 });
  const bottomRight = worldToScreen({ x: boardRadius + 0.5, y: boardRadius + 0.5 });
  ctx.fillStyle = palette.out;
  ctx.fillRect(0, 0, rect.width, Math.max(0, topLeft.y));
  ctx.fillRect(0, bottomRight.y, rect.width, Math.max(0, rect.height - bottomRight.y));
  ctx.fillRect(0, topLeft.y, Math.max(0, topLeft.x), bottomRight.y - topLeft.y);
  ctx.fillRect(bottomRight.x, topLeft.y, Math.max(0, rect.width - bottomRight.x), bottomRight.y - topLeft.y);

  if (escapeRadius <= boardRadius) {
    drawWorldRect(-boardRadius, boardRadius, -boardRadius, -escapeRadius, palette.escape);
    drawWorldRect(-boardRadius, boardRadius, escapeRadius, boardRadius, palette.escape);
    drawWorldRect(-boardRadius, -escapeRadius, -escapeRadius + 1, escapeRadius - 1, palette.escape);
    drawWorldRect(escapeRadius, boardRadius, -escapeRadius + 1, escapeRadius - 1, palette.escape);
  } else {
    drawWorldRect(-escapeRadius, escapeRadius, -escapeRadius, -boardRadius - 1, palette.escape);
    drawWorldRect(-escapeRadius, escapeRadius, boardRadius + 1, escapeRadius, palette.escape);
    drawWorldRect(-escapeRadius, -boardRadius - 1, -boardRadius, boardRadius, palette.escape);
    drawWorldRect(boardRadius + 1, escapeRadius, -boardRadius, boardRadius, palette.escape);
  }

  drawWorldRect(-escapeRadius, escapeRadius, -escapeRadius, escapeRadius, null, palette.escapeBorder);
  drawWorldRect(-boardRadius, boardRadius, -boardRadius, boardRadius, null, palette.ink);
  drawWorldRect(-outerRadius, outerRadius, -outerRadius, outerRadius, null, "rgba(58, 157, 111, 0.28)");
}

function drawCellFill(cell, fill, stroke = null) {
  const screen = worldToScreen(cell);
  const size = camera.cellSize;
  const inset = Math.max(3, size * 0.08);
  ctx.fillStyle = fill;
  ctx.fillRect(screen.x - size / 2 + inset, screen.y - size / 2 + inset, size - inset * 2, size - inset * 2);
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.strokeRect(
      screen.x - size / 2 + inset,
      screen.y - size / 2 + inset,
      size - inset * 2,
      size - inset * 2,
    );
  }
}

function drawBlock(cell) {
  const screen = worldToScreen(cell);
  const size = camera.cellSize;
  const blockSize = size * 0.66;
  const x = screen.x - blockSize / 2;
  const y = screen.y - blockSize / 2;
  ctx.fillStyle = palette.block;
  ctx.fillRect(x, y + blockSize * 0.12, blockSize, blockSize * 0.78);
  ctx.fillStyle = palette.blockTop;
  ctx.fillRect(x + blockSize * 0.12, y, blockSize * 0.76, blockSize * 0.2);
}

function drawAngel(cell) {
  const screen = worldToScreen(cell);
  const size = camera.cellSize;
  const radius = size * 0.28;

  ctx.fillStyle = "rgba(246, 196, 79, 0.22)";
  ctx.beginPath();
  ctx.arc(screen.x, screen.y, size * 0.45, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = palette.angel;
  ctx.beginPath();
  ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = palette.angelCore;
  ctx.beginPath();
  ctx.arc(screen.x, screen.y - radius * 0.22, radius * 0.36, 0, Math.PI * 2);
  ctx.fill();
}

function drawDevilPreview(cell) {
  const screen = worldToScreen(cell);
  const size = camera.cellSize;
  ctx.strokeStyle = palette.devil;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(screen.x - size * 0.22, screen.y - size * 0.22);
  ctx.lineTo(screen.x + size * 0.22, screen.y + size * 0.22);
  ctx.moveTo(screen.x + size * 0.22, screen.y - size * 0.22);
  ctx.lineTo(screen.x - size * 0.22, screen.y + size * 0.22);
  ctx.stroke();
}

function drawCoordinates() {
  const rect = canvas.getBoundingClientRect();
  const cell = hoverCell ?? state.angel;
  ctx.fillStyle = "rgba(255, 255, 255, 0.86)";
  ctx.fillRect(14, rect.height - 43, 156, 28);
  ctx.fillStyle = palette.ink;
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillText(`x ${cell.x}, y ${cell.y}`, 26, rect.height - 24);
}

function draw() {
  drawArena();

  if (state.turn === TURN.ANGEL) {
    for (const cell of legalAngelCells(state)) {
      drawCellFill(cell, palette.highlight);
    }
  }

  const bounds = visibleBounds();
  for (const key of state.blocks) {
    const [x, y] = key.split(",").map(Number);
    if (x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY) {
      drawBlock({ x, y });
    }
  }

  if (hoverCell && state.turn === TURN.DEVIL && canPlaceBlock(state, hoverCell)) {
    drawDevilPreview(hoverCell);
  }

  if (hoverCell && state.turn === TURN.ANGEL && canMoveAngel(state, hoverCell)) {
    drawCellFill(hoverCell, "rgba(246, 196, 79, 0.28)", palette.highlightBorder);
  }

  drawAngel(state.angel);
  drawCoordinates();
}

function updateStatus(message = null) {
  powerLabel.textContent = state.power;
  blockCount.textContent = state.blocks.size;
  blockQuota.textContent = `${state.devilBlocksThisTurn} / ${state.rules.blocksPerDevilTurn}`;
  undoButton.disabled = online.enabled || state.history.length === 0;

  const labels = {
    [TURN.DEVIL]: "恶魔放置路障",
    [TURN.ANGEL]: "天使移动",
    [TURN.ANGEL_WON]: "天使获胜",
    [TURN.DEVIL_WON]: "恶魔获胜",
  };
  const distance = distanceFromStart(state.angel);
  const escaped = Math.min(distance, state.rules.escapeRadius);
  turnLabel.textContent = labels[state.turn] ?? "未开始";
  escapeProgress.textContent = `${escaped} / ${state.rules.escapeRadius}`;
  moveProgress.textContent = `${state.angelMoves} / ${state.rules.maxAngelMoves}`;

  if (message) {
    messagePanel.textContent = message;
    return;
  }

  if (online.enabled && state.turn !== TURN.ANGEL_WON && state.turn !== TURN.DEVIL_WON) {
    if (online.role === "devil" && state.turn !== TURN.DEVIL) {
      messagePanel.textContent = "联机中：你是恶魔，等待天使移动。";
      return;
    }
    if (online.role === "angel" && state.turn !== TURN.ANGEL) {
      messagePanel.textContent = "联机中：你是天使，等待恶魔封锁。";
      return;
    }
    if (online.role === "spectator") {
      messagePanel.textContent = "联机中：你正在观战。";
      return;
    }
  }

  if (state.turn === TURN.DEVIL) {
    const remaining = state.rules.blocksPerDevilTurn - state.devilBlocksThisTurn;
    messagePanel.textContent = `恶魔回合：还需封锁 ${remaining} 格，阻止天使抵达绿色逃脱线。`;
  } else if (state.turn === TURN.ANGEL) {
    messagePanel.textContent = `天使回合：点击高亮范围内的空格移动，最多 ${state.power} 步，不能回到上一格。`;
  } else if (state.turn === TURN.ANGEL_WON) {
    messagePanel.textContent = hasMoveLimitWin()
      ? "天使撑过了最大回合数，成功逃脱。"
      : "天使抵达了绿色逃脱外圈，天使获胜。";
  } else {
    messagePanel.textContent = "天使已经没有任何合法落点，恶魔获胜。";
  }
}

function hasMoveLimitWin() {
  return state.angelMoves >= state.rules.maxAngelMoves && distanceFromStart(state.angel) < state.rules.escapeRadius;
}

function readRulesFromInputs() {
  return normalizeRules({
    boardRadius: boardRadiusInput.value,
    escapeRadius: escapeInput.value,
    maxAngelMoves: maxMovesInput.value,
    blocksPerDevilTurn: blocksPerTurnInput.value,
  });
}

function syncRuleInputs(rules) {
  boardRadiusInput.value = rules.boardRadius;
  escapeInput.value = rules.escapeRadius;
  maxMovesInput.value = rules.maxAngelMoves;
  blocksPerTurnInput.value = rules.blocksPerDevilTurn;
}

function hydrateState(snapshot) {
  return {
    power: snapshot.power,
    rules: snapshot.rules,
    turn: snapshot.turn,
    angel: snapshot.angel,
    previousAngel: snapshot.previousAngel,
    angelMoves: snapshot.angelMoves,
    devilBlocksThisTurn: snapshot.devilBlocksThisTurn,
    blocks: new Set(snapshot.blocks),
    history: [],
  };
}

function setOnlineMode(nextOnline) {
  if (online.pollTimer) window.clearInterval(online.pollTimer);
  online = { ...online, ...nextOnline, pollTimer: null };
  updateOnlinePanel();
}

function stopOnlineMode() {
  if (online.pollTimer) window.clearInterval(online.pollTimer);
  online = { enabled: false, roomId: null, playerId: null, role: null, version: 0, pollTimer: null };
  localStorage.removeItem(onlineStorageKey);
  updateOnlinePanel();
}

function updateOnlinePanel() {
  if (!online.enabled) {
    onlineStatus.textContent = "本地模式";
    roomCodeLabel.textContent = "----";
    return;
  }

  const roleLabel = online.role === "devil" ? "恶魔" : online.role === "angel" ? "天使" : "观战";
  onlineStatus.textContent = `联机中：${roleLabel}`;
  roomCodeLabel.textContent = online.roomId;
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.reason ?? "请求失败。");
  return data;
}

function saveOnlineSession() {
  if (!online.enabled) return;
  localStorage.setItem(
    onlineStorageKey,
    JSON.stringify({
      roomId: online.roomId,
      playerId: online.playerId,
    }),
  );
}

async function restoreOnlineSession() {
  const saved = localStorage.getItem(onlineStorageKey);
  if (!saved) {
    if (roomFromUrl) updateStatus("房间码已填好，点击加入即可成为天使。");
    return;
  }

  try {
    const session = JSON.parse(saved);
    if (!session.roomId || !session.playerId) return;
    const data = await apiRequest(`/api/rooms/${session.roomId}?playerId=${session.playerId}`);
    setOnlineMode({
      enabled: true,
      roomId: session.roomId,
      playerId: session.playerId,
      role: data.room.playerRole,
      version: data.room.version,
    });
    applyRoomSnapshot(data.room, "已恢复联机房间。");
    startPolling();
  } catch {
    localStorage.removeItem(onlineStorageKey);
    if (roomFromUrl) updateStatus("房间码已填好，点击加入即可成为天使。");
  }
}

function applyRoomSnapshot(room, message = null) {
  state = hydrateState(room.state);
  online.role = room.playerRole;
  online.version = room.version;
  syncRuleInputs(state.rules);
  powerInput.value = state.power;
  updateOnlinePanel();
  updateStatus(message);
  draw();
}

function startPolling() {
  if (online.pollTimer) window.clearInterval(online.pollTimer);
  online.pollTimer = window.setInterval(async () => {
    if (!online.enabled) return;
    try {
      const data = await apiRequest(`/api/rooms/${online.roomId}?playerId=${online.playerId}`);
      if (data.room.version !== online.version) applyRoomSnapshot(data.room);
    } catch (error) {
      updateStatus(error.message);
    }
  }, 900);
}

async function createOnlineRoom() {
  try {
    const rules = readRulesFromInputs();
    const data = await apiRequest("/api/rooms", {
      method: "POST",
      body: JSON.stringify({ power: normalizePower(powerInput.value), rules }),
    });
    setOnlineMode({
      enabled: true,
      roomId: data.room.id,
      playerId: data.playerId,
      role: data.room.playerRole,
      version: data.room.version,
    });
    applyRoomSnapshot(data.room, `房间已创建。你是恶魔，把房间码 ${data.room.id} 发给朋友。`);
    saveOnlineSession();
    startPolling();
  } catch (error) {
    updateStatus(error.message);
  }
}

async function joinOnlineRoom() {
  const roomId = roomCodeInput.value.trim().toUpperCase();
  if (!roomId) {
    updateStatus("请输入朋友发来的房间码。");
    return;
  }

  try {
    const data = await apiRequest(`/api/rooms/${roomId}/join`, {
      method: "POST",
      body: JSON.stringify({ playerId: online.playerId }),
    });
    setOnlineMode({
      enabled: true,
      roomId: data.room.id,
      playerId: data.playerId,
      role: data.room.playerRole,
      version: data.room.version,
    });
    applyRoomSnapshot(data.room, "加入成功。你是天使，等待恶魔封锁。");
    saveOnlineSession();
    startPolling();
  } catch (error) {
    updateStatus(error.message);
  }
}

function canActOnline() {
  if (!online.enabled) return true;
  if (online.role === "devil") return state.turn === TURN.DEVIL;
  if (online.role === "angel") return state.turn === TURN.ANGEL;
  return false;
}

function startNewGame() {
  stopOnlineMode();
  const power = normalizePower(powerInput.value);
  const rules = readRulesFromInputs();
  powerInput.value = power;
  syncRuleInputs(rules);
  state = createGame(power, rules);
  camera = { ...camera, x: state.angel.x, y: state.angel.y };
  hoverCell = null;
  updateStatus(`游戏开始。恶魔先手，每回合连续封锁 ${state.rules.blocksPerDevilTurn} 格。`);
  draw();
}

async function submitOnlineAction(cell) {
  if (!canActOnline()) {
    updateStatus("现在还没轮到你。");
    return;
  }

  const type = online.role === "devil" ? "block" : "move";
  try {
    const data = await apiRequest(`/api/rooms/${online.roomId}/action`, {
      method: "POST",
      body: JSON.stringify({ playerId: online.playerId, type, cell }),
    });
    applyRoomSnapshot(data.room);
  } catch (error) {
    updateStatus(error.message);
  }
}

async function resetOnlineRoom() {
  try {
    const data = await apiRequest(`/api/rooms/${online.roomId}/action`, {
      method: "POST",
      body: JSON.stringify({ playerId: online.playerId, type: "reset" }),
    });
    applyRoomSnapshot(data.room, "联机房间已重开。");
  } catch (error) {
    updateStatus(error.message);
  }
}

function handleBoardClick(cell) {
  if (state.turn === TURN.ANGEL_WON || state.turn === TURN.DEVIL_WON) return;

  if (online.enabled) {
    submitOnlineAction(cell);
    return;
  }

  if (state.turn === TURN.DEVIL) {
    const result = placeBlock(state, cell);
    state = result.state;
    updateStatus(result.ok ? null : result.reason);
    draw();
    return;
  }

  if (state.turn === TURN.ANGEL) {
    const result = moveAngel(state, cell);
    state = result.state;
    if (result.ok) {
      camera.x = state.angel.x;
      camera.y = state.angel.y;
    }
    updateStatus(result.ok ? null : result.reason);
    draw();
  }
}

canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  isPanning = true;
  dragMoved = false;
  panStart = {
    clientX: event.clientX,
    clientY: event.clientY,
    cameraX: camera.x,
    cameraY: camera.y,
  };
});

canvas.addEventListener("pointermove", (event) => {
  hoverCell = screenToWorld(event.clientX, event.clientY);

  if (isPanning && panStart) {
    const dx = event.clientX - panStart.clientX;
    const dy = event.clientY - panStart.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 4) dragMoved = true;
    camera.x = panStart.cameraX - dx / camera.cellSize;
    camera.y = panStart.cameraY - dy / camera.cellSize;
  }

  draw();
});

canvas.addEventListener("pointerup", (event) => {
  canvas.releasePointerCapture(event.pointerId);
  const clickedCell = screenToWorld(event.clientX, event.clientY);
  isPanning = false;
  panStart = null;
  if (!dragMoved) handleBoardClick(clickedCell);
});

canvas.addEventListener("pointerleave", () => {
  hoverCell = null;
  isPanning = false;
  draw();
});

canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const nextSize = camera.cellSize * (event.deltaY > 0 ? 0.9 : 1.1);
    camera.cellSize = Math.max(24, Math.min(78, nextSize));
    draw();
  },
  { passive: false },
);

startGameButton.addEventListener("click", startNewGame);
createRoomButton.addEventListener("click", createOnlineRoom);
joinRoomButton.addEventListener("click", joinOnlineRoom);
roomCodeInput.addEventListener("input", () => {
  roomCodeInput.value = roomCodeInput.value.toUpperCase();
});
roomCodeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") joinOnlineRoom();
});
resetGameButton.addEventListener("click", () => {
  if (online.enabled) {
    resetOnlineRoom();
  } else {
    startNewGame();
  }
});
undoButton.addEventListener("click", () => {
  if (online.enabled) return;
  state = undo(state);
  updateStatus("已撤销上一步。");
  draw();
});
zoomInButton.addEventListener("click", () => {
  camera.cellSize = Math.min(78, camera.cellSize * 1.12);
  draw();
});
zoomOutButton.addEventListener("click", () => {
  camera.cellSize = Math.max(24, camera.cellSize * 0.88);
  draw();
});
centerAngelButton.addEventListener("click", () => {
  camera.x = state.angel.x;
  camera.y = state.angel.y;
  draw();
});
powerInput.addEventListener("input", () => {
  powerLabel.textContent = normalizePower(powerInput.value);
});
for (const input of [escapeInput, maxMovesInput, boardRadiusInput, blocksPerTurnInput]) {
  input.addEventListener("input", () => {
    const rules = readRulesFromInputs();
    syncRuleInputs(rules);
    state.rules = rules;
    updateStatus();
    draw();
  });
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
updateStatus();
restoreOnlineSession();
