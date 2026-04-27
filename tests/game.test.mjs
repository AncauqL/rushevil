import assert from "node:assert/strict";
import {
  TURN,
  canMoveAngel,
  canPlaceBlock,
  createGame,
  distanceForAngel,
  moveAngel,
  placeBlock,
} from "../src/game.js";

let state = createGame(2, { blocksPerDevilTurn: 1 });
assert.equal(distanceForAngel({ x: 0, y: 0 }, { x: 2, y: 1 }), 2);

let result = placeBlock(state, { x: 0, y: 0 });
assert.equal(result.ok, false, "devil cannot block the angel cell");
assert.equal(result.state.blocks.size, 0);

result = placeBlock(state, { x: 1, y: 0 });
assert.equal(result.ok, true);
state = result.state;
assert.equal(state.turn, TURN.ANGEL);
assert.equal(canMoveAngel(state, { x: 2, y: 0 }), true, "angel can pass through a blocked cell");
assert.equal(canMoveAngel(state, { x: 1, y: 0 }), false, "angel cannot land on a blocked cell");

result = moveAngel(state, { x: 2, y: 0 });
assert.equal(result.ok, true);
assert.deepEqual(result.state.angel, { x: 2, y: 0 });
assert.equal(result.state.turn, TURN.DEVIL);

state = createGame(1);
result = placeBlock(state, { x: 1, y: 0 });
assert.equal(result.ok, true);
assert.equal(result.state.turn, TURN.DEVIL, "devil must place both blocks before angel moves");
assert.equal(result.state.devilBlocksThisTurn, 1);
result = placeBlock(result.state, { x: 0, y: 1 });
assert.equal(result.ok, true);
assert.equal(result.state.turn, TURN.ANGEL);
assert.equal(result.state.devilBlocksThisTurn, 0);

state = createGame(4, { boardRadius: 8, escapeRadius: 4, maxAngelMoves: 10, blocksPerDevilTurn: 1 });
assert.equal(canPlaceBlock(state, { x: 9, y: 0 }), false, "devil cannot block outside the board");
result = placeBlock(state, { x: -1, y: 0 });
assert.equal(result.ok, true);
state = result.state;
result = moveAngel(state, { x: 4, y: 0 });
assert.equal(result.ok, true);
assert.equal(result.state.turn, TURN.ANGEL_WON, "angel wins by reaching the escape ring");

state = createGame(1, { boardRadius: 20, escapeRadius: 22, maxAngelMoves: 32, blocksPerDevilTurn: 1 });
state.angel = { x: 21, y: 0 };
result = placeBlock(state, { x: 0, y: 1 });
assert.equal(result.ok, true);
state = result.state;
result = moveAngel(state, { x: 22, y: 0 });
assert.equal(result.ok, true);
assert.equal(result.state.turn, TURN.ANGEL_WON, "angel wins at escape distance 22");

state = createGame(1, { boardRadius: 8, escapeRadius: 8, maxAngelMoves: 10, blocksPerDevilTurn: 1 });
result = placeBlock(state, { x: 4, y: 4 });
state = result.state;
result = moveAngel(state, { x: 1, y: 0 });
assert.equal(result.ok, true);
state = result.state;
result = placeBlock(state, { x: 4, y: 3 });
state = result.state;
assert.equal(canMoveAngel(state, { x: 0, y: 0 }), false, "angel cannot move back to the previous cell");

state = createGame(1, {
  boardRadius: 4,
  escapeRadius: 4,
  maxAngelMoves: 10,
  blocksPerDevilTurn: 1,
  forbidBacktracking: false,
});
for (let move = 0; move < 10; move += 1) {
  result = placeBlock(state, { x: -4 + move, y: 4 });
  assert.equal(result.ok, true);
  state = result.state;
  const target = move % 2 === 0 ? { x: 1, y: 0 } : { x: 0, y: 0 };
  result = moveAngel(state, target);
  assert.equal(result.ok, true);
  state = result.state;
}
assert.equal(state.turn, TURN.ANGEL_WON, "angel wins by surviving the move limit");

state = createGame(1, { blocksPerDevilTurn: 1 });
for (const cell of [
  { x: -1, y: -1 },
  { x: -1, y: 0 },
  { x: -1, y: 1 },
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: 1, y: -1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
]) {
  state.turn = TURN.DEVIL;
  result = placeBlock(state, cell);
  assert.equal(result.ok, true);
  state = result.state;
}

assert.equal(state.turn, TURN.DEVIL_WON, "devil wins when all K=1 destinations are blocked");
console.log("game rules ok");
