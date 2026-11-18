'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// index.html 안의 게임 로직 블록만 꺼내 DOM 없이 실행한다.
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/<script id="game-logic">([\s\S]*?)<\/script>/);
assert.ok(m, 'index.html 에 game-logic 블록이 없다');
const ctx = vm.createContext({});
vm.runInContext(m[1], ctx);
const G = ctx.Game;
const plain = (x) => JSON.parse(JSON.stringify(x));

// 수 목록을 차례로 둔다.
function play(state, moves) { return moves.reduce((s, [r, c]) => G.place(s, r, c), state); }

test('새 판: 10x10, 비어 있고 흑 차례', () => {
  const s = G.create(10, 5);
  assert.equal(s.board.length, 100);
  assert.ok(s.board.every((v) => v === 0));
  assert.equal(s.turn, 1);
  assert.equal(s.winner, 0);
});

test('돌을 두면 차례가 바뀌고 원본은 그대로', () => {
  const s0 = G.create(10, 5);
  const s1 = G.place(s0, 0, 0);
  assert.equal(s1.board[0], 1);
  assert.equal(s1.turn, 2);
  assert.equal(s0.board[0], 0);
  assert.equal(s0.turn, 1);
});

test('이미 돌이 있는 칸·판 밖은 무시', () => {
  const s1 = G.place(G.create(10, 5), 3, 3);
  assert.equal(G.place(s1, 3, 3), s1);
  for (const [r, c] of [[-1, 0], [0, -1], [10, 0], [0, 10], [1.5, 2]]) assert.equal(G.place(s1, r, c), s1);
});

test('오목: 가로 5개 승리 (흑)', () => {
  const s = play(G.create(10, 5), [[0,0],[1,0],[0,1],[1,1],[0,2],[1,2],[0,3],[1,3],[0,4]]);
  assert.equal(s.winner, 1);
  assert.deepEqual(plain(s.line), [[0,0],[0,1],[0,2],[0,3],[0,4]]);
});

test('오목: 4개로는 승리하지 못한다', () => {
  const s = play(G.create(10, 5), [[0,0],[1,0],[0,1],[1,1],[0,2],[1,2],[0,3]]);
  assert.equal(s.winner, 0);
});

test('오목: 세로 승리 (백)', () => {
  const s = play(G.create(10, 5), [[9,9],[0,0],[9,7],[1,0],[9,5],[2,0],[9,3],[3,0],[8,8],[4,0]]);
  assert.equal(s.winner, 2);
  assert.equal(s.line.length, 5);
});

test('오목: 대각선 두 방향 승리', () => {
  const a = play(G.create(10, 5), [[0,0],[0,9],[1,1],[0,8],[2,2],[0,7],[3,3],[0,6],[4,4]]);
  assert.equal(a.winner, 1);
  const b = play(G.create(10, 5), [[0,9],[9,0],[1,8],[9,1],[2,7],[9,2],[3,6],[9,3],[4,5]]);
  assert.equal(b.winner, 1);
});

test('오목: 마지막 돌이 가운데를 메워 잇는 경우도 승리', () => {
  const s = play(G.create(10, 5), [[5,0],[0,0],[5,1],[0,2],[5,3],[0,4],[5,4],[0,6],[5,2]]);
  assert.equal(s.winner, 1);
  assert.equal(s.line.length, 5);
});

test('오목: 6개 이상 이어도 승리(자유 오목)', () => {
  const s = play(G.create(10, 5), [[2,0],[0,0],[2,1],[0,2],[2,2],[0,4],[2,4],[0,6],[2,5],[0,8],[2,3]]);
  assert.equal(s.winner, 1);
  assert.equal(s.line.length, 6);
});

test('판 가장자리에서 줄이 끊긴다 (다음 행으로 이어지지 않음)', () => {
  const s = play(G.create(10, 5), [[0,8],[5,5],[0,9],[5,7],[1,0],[5,9],[1,1],[7,0],[1,2]]);
  assert.equal(s.winner, 0);
});

test('3목: 3개로 승리', () => {
  const s = play(G.create(10, 3), [[0,0],[1,0],[0,1],[1,1],[0,2]]);
  assert.equal(s.winner, 1);
  assert.equal(s.line.length, 3);
});

test('승부가 난 뒤에는 더 둘 수 없다', () => {
  const s = play(G.create(10, 3), [[0,0],[1,0],[0,1],[1,1],[0,2]]);
  assert.equal(G.place(s, 5, 5), s);
});

test('무승부: 판이 가득 차도 승자가 없으면 무승부', () => {
  // 3x3 판, 3목: 흑 (0,0)(0,2)(1,0)(1,2)(2,1) / 백 (0,1)(1,1)(2,0)(2,2) 순서로 무승부 배치
  const s = play(G.create(3, 3), [[0,0],[0,1],[0,2],[1,1],[1,0],[2,0],[1,2],[2,2],[2,1]]);
  assert.equal(s.winner, 0);
  assert.equal(s.draw, true);
  assert.equal(G.place(s, 0, 0), s);
});

test('마지막 칸으로 승리하면 무승부가 아니다', () => {
  // 3x3, 3목: 마지막(9번째) 수로 흑이 (0,0)(1,1)(2,2) 대각선 완성
  const s = play(G.create(3, 3), [[0,0],[0,1],[0,2],[1,0],[2,1],[1,2],[2,0],[2,2],[1,1]]);
  assert.equal(s.winner, 1);
  assert.equal(s.draw, false);
});

test('무르기: 마지막 수를 되돌리고 차례도 돌아온다', () => {
  const s = play(G.create(10, 5), [[0,0],[1,1],[2,2]]);
  const u = G.undo(s);
  assert.equal(u.board[2 * 10 + 2], 0);
  assert.equal(u.turn, 1);
  assert.equal(u.moves.length, 2);
});

test('무르기: 승리한 판도 물릴 수 있고, 빈 판에서는 변화 없음', () => {
  const win = play(G.create(10, 3), [[0,0],[1,0],[0,1],[1,1],[0,2]]);
  const u = G.undo(win);
  assert.equal(u.winner, 0);
  assert.equal(u.turn, 1);
  const e = G.create(10, 5);
  assert.equal(G.undo(e), e);
});
