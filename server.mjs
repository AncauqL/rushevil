import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGame, moveAngel, normalizePower, normalizeRules, placeBlock, serializeState, TURN } from "./src/game.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number.parseInt(process.env.PORT ?? "8000", 10);
const host = process.env.HOST ?? "0.0.0.0";
const rooms = new Map();

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function resolvePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const requested = normalize(decoded === "/" ? "/index.html" : decoded);
  const absolute = resolve(join(root, requested));
  if (!absolute.startsWith(resolve(root))) return null;
  return absolute;
}

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function readJson(request) {
  return new Promise((resolveBody, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100_000) {
        request.destroy();
        reject(new Error("Request body too large"));
      }
    });
    request.on("end", () => {
      if (!body) {
        resolveBody({});
        return;
      }
      try {
        resolveBody(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    request.on("error", reject);
  });
}

function createRoomId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  do {
    id = "";
    for (let i = 0; i < 5; i += 1) {
      id += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
  } while (rooms.has(id));
  return id;
}

function publicRoom(room, playerId = null) {
  return {
    id: room.id,
    version: room.version,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    playerRole: playerId ? roleFor(room, playerId) : null,
    players: {
      devil: Boolean(room.players.devil),
      angel: Boolean(room.players.angel),
    },
    state: serializeState(room.state),
  };
}

function roleFor(room, playerId) {
  if (room.players.devil === playerId) return "devil";
  if (room.players.angel === playerId) return "angel";
  return "spectator";
}

function touch(room) {
  room.version += 1;
  room.updatedAt = new Date().toISOString();
}

function cleanupRooms() {
  const now = Date.now();
  const ttl = 1000 * 60 * 60 * 6;
  for (const [id, room] of rooms) {
    if (now - Date.parse(room.updatedAt) > ttl) rooms.delete(id);
  }
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true, rooms: rooms.size });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/rooms") {
    const body = await readJson(request);
    const id = createRoomId();
    const playerId = randomUUID();
    const state = createGame(normalizePower(body.power), normalizeRules(body.rules));
    const now = new Date().toISOString();
    const room = {
      id,
      version: 1,
      createdAt: now,
      updatedAt: now,
      state,
      players: {
        devil: playerId,
        angel: null,
      },
    };
    rooms.set(id, room);
    cleanupRooms();
    sendJson(response, 201, { playerId, room: publicRoom(room, playerId) });
    return true;
  }

  const roomMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{5})(?:\/(join|action))?$/);
  if (!roomMatch) return false;

  const roomId = roomMatch[1];
  const action = roomMatch[2] ?? null;
  const room = rooms.get(roomId);
  if (!room) {
    sendJson(response, 404, { ok: false, reason: "房间不存在或已过期。" });
    return true;
  }

  if (request.method === "GET" && !action) {
    const playerId = url.searchParams.get("playerId");
    sendJson(response, 200, { room: publicRoom(room, playerId) });
    return true;
  }

  if (request.method === "POST" && action === "join") {
    const body = await readJson(request);
    const playerId = body.playerId ?? randomUUID();
    if (room.players.angel && room.players.angel !== playerId) {
      sendJson(response, 409, { ok: false, reason: "房间里的天使席位已经有人了。" });
      return true;
    }
    room.players.angel = playerId;
    touch(room);
    sendJson(response, 200, { playerId, room: publicRoom(room, playerId) });
    return true;
  }

  if (request.method === "POST" && action === "action") {
    const body = await readJson(request);
    const playerId = body.playerId;
    const role = roleFor(room, playerId);

    if (body.type === "reset") {
      if (role !== "devil") {
        sendJson(response, 403, { ok: false, reason: "只有房主可以重开联机房间。" });
        return true;
      }
      room.state = createGame(room.state.power, room.state.rules);
      touch(room);
      sendJson(response, 200, { ok: true, room: publicRoom(room, playerId) });
      return true;
    }

    if (body.type === "block") {
      if (role !== "devil") {
        sendJson(response, 403, { ok: false, reason: "只有恶魔可以封锁格子。" });
        return true;
      }
      const result = placeBlock(room.state, body.cell);
      if (!result.ok) {
        sendJson(response, 400, { ok: false, reason: result.reason, room: publicRoom(room, playerId) });
        return true;
      }
      room.state = result.state;
      touch(room);
      sendJson(response, 200, { ok: true, room: publicRoom(room, playerId) });
      return true;
    }

    if (body.type === "move") {
      if (role !== "angel") {
        sendJson(response, 403, { ok: false, reason: "只有天使可以移动。" });
        return true;
      }
      if (room.state.turn !== TURN.ANGEL) {
        sendJson(response, 400, { ok: false, reason: "还没轮到天使行动。", room: publicRoom(room, playerId) });
        return true;
      }
      const result = moveAngel(room.state, body.cell);
      if (!result.ok) {
        sendJson(response, 400, { ok: false, reason: result.reason, room: publicRoom(room, playerId) });
        return true;
      }
      room.state = result.state;
      touch(room);
      sendJson(response, 200, { ok: true, room: publicRoom(room, playerId) });
      return true;
    }

    sendJson(response, 400, { ok: false, reason: "未知动作。" });
    return true;
  }

  sendJson(response, 405, { ok: false, reason: "Method not allowed" });
  return true;
}

export function createAppServer() {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`);

    try {
      if (url.pathname.startsWith("/api/") && (await handleApi(request, response, url))) return;
    } catch (error) {
      sendJson(response, 400, { ok: false, reason: error.message });
      return;
    }

    const filePath = resolvePath(url.pathname);
    if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, { "content-type": types[extname(filePath)] ?? "application/octet-stream" });
    createReadStream(filePath).pipe(response);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createAppServer();
  server.listen(port, host, () => {
    console.log(`Angel vs Devil is running at http://${host}:${port}`);
  });
}
