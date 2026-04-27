import assert from "node:assert/strict";
import { createAppServer } from "../server.mjs";

const server = createAppServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

async function request(path, body = null) {
  const response = await fetch(`${base}${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  assert.equal(response.ok, true, data.reason);
  return data;
}

try {
  const created = await request("/api/rooms", {
    power: 1,
    rules: {
      boardRadius: 20,
      escapeRadius: 22,
      maxAngelMoves: 32,
      blocksPerDevilTurn: 2,
    },
  });

  assert.equal(created.room.playerRole, "devil");
  assert.equal(created.room.state.turn, "devil");
  assert.equal(created.room.state.rules.blocksPerDevilTurn, 2);

  const joined = await request(`/api/rooms/${created.room.id}/join`, {});
  assert.equal(joined.room.playerRole, "angel");

  const firstBlock = await request(`/api/rooms/${created.room.id}/action`, {
    playerId: created.playerId,
    type: "block",
    cell: { x: 1, y: 0 },
  });
  assert.equal(firstBlock.room.state.turn, "devil");
  assert.equal(firstBlock.room.state.devilBlocksThisTurn, 1);

  const secondBlock = await request(`/api/rooms/${created.room.id}/action`, {
    playerId: created.playerId,
    type: "block",
    cell: { x: 0, y: 1 },
  });
  assert.equal(secondBlock.room.state.turn, "angel");

  const moved = await request(`/api/rooms/${created.room.id}/action`, {
    playerId: joined.playerId,
    type: "move",
    cell: { x: -1, y: 0 },
  });
  assert.equal(moved.room.state.turn, "devil");
  assert.deepEqual(moved.room.state.angel, { x: -1, y: 0 });

  console.log("api ok");
} finally {
  await new Promise((resolve) => server.close(resolve));
}
