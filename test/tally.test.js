'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// index.html 안의 계산 로직 블록만 꺼내 DOM 없이 실행한다.
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/<script id="tally-logic">([\s\S]*?)<\/script>/);
assert.ok(m, 'index.html 에 tally-logic 블록이 없다');
const ctx = vm.createContext({});
vm.runInContext(m[1], ctx);
const T = ctx.Tally;
// vm 컨텍스트의 객체는 프로토타입이 달라 deepStrictEqual 이 실패하므로 JSON 으로 옮겨 비교한다.
const plain = (x) => JSON.parse(JSON.stringify(x));
const parseCell = (v) => plain(T.parseCell(v));
const formatMean = T.formatMean;
const tally = (t) => plain(T.tally(t));

test('칸 판정: 1~5는 유효, 앞뒤 공백은 무시', () => {
  for (const v of [1, 2, 3, 4, 5]) {
    assert.deepEqual(parseCell(String(v)), { kind: 'valid', value: v });
    assert.equal(parseCell(`  ${v}\t `).kind, 'valid');
  }
});

test('칸 판정: 비었거나 공백만 있으면 빈 응답', () => {
  for (const v of ['', ' ', '   ', '\r', undefined, null]) assert.equal(parseCell(v).kind, 'blank');
});

test('칸 판정: 그 밖의 값은 제외', () => {
  for (const v of ['0', '6', '10', '1.0', '01', '+1', '-1', '１', 'a', '1 2', '-', 'N/A', '1,2']) {
    assert.equal(parseCell(v).kind, 'excluded', JSON.stringify(v));
  }
});

test('평균 포맷: 둘째 자리까지, 셋째 자리 반올림', () => {
  assert.equal(formatMean(10, 3), '3.33');
  assert.equal(formatMean(11, 3), '3.67');
  assert.equal(formatMean(4, 1), '4.00');
  assert.equal(formatMean(3, 2), '1.50');
  assert.equal(formatMean(201, 200), '1.01'); // 1.005 → 1.01 (반올림, 부동소수점 오차 없음)
  assert.equal(formatMean(1, 8), '0.13');     // 0.125 → 0.13
  assert.equal(formatMean(5, 1), '5.00');
});

test('평균 포맷: 유효 0이면 "-"', () => {
  assert.equal(formatMean(0, 0), '-');
});

test('기본 집계: 첫 열은 집계하지 않는다', () => {
  const r = tally('번호\tQ1\tQ2\n1\t5\t3\n2\t4\t2\n3\t3\t1');
  assert.equal(r.rowCount, 3);
  assert.deepEqual(r.items, [
    { name: 'Q1', valid: 3, mean: '4.00', blank: 0, excluded: 0 },
    { name: 'Q2', valid: 3, mean: '2.00', blank: 0, excluded: 0 },
  ]);
});

test('유효·빈·제외가 섞인 경우', () => {
  const r = tally('번호\tQ1\n1\t5\n2\t\n3\t 4 \n4\t9\n5\t   \n6\tabc\n7\t1');
  assert.deepEqual(r.items, [{ name: 'Q1', valid: 3, mean: '3.33', blank: 2, excluded: 2 }]);
});

test('칸 수가 모자란 줄: 모자란 칸은 빈 응답', () => {
  const r = tally('번호\tQ1\tQ2\tQ3\n1\t5\n2\t4\t3\n3');
  assert.deepEqual(r.items, [
    { name: 'Q1', valid: 2, mean: '4.50', blank: 1, excluded: 0 },
    { name: 'Q2', valid: 1, mean: '3.00', blank: 2, excluded: 0 },
    { name: 'Q3', valid: 0, mean: '-', blank: 3, excluded: 0 },
  ]);
});

test('머리글보다 칸이 많으면 초과 칸은 무시', () => {
  const r = tally('번호\tQ1\n1\t5\t4\t9');
  assert.deepEqual(r.items, [{ name: 'Q1', valid: 1, mean: '5.00', blank: 0, excluded: 0 }]);
});

test('줄바꿈 형식(CRLF·CR)과 끝의 빈 줄', () => {
  const a = tally('번호\tQ1\r\n1\t5\r\n2\t3\r\n\r\n');
  assert.equal(a.rowCount, 2);
  assert.equal(a.items[0].mean, '4.00');
  const b = tally('번호\tQ1\r1\t5\r2\t3');
  assert.equal(b.rowCount, 2);
});

test('탭만 있는 줄은 모든 문항이 빈 응답인 응답 줄', () => {
  const r = tally('번호\tQ1\tQ2\n1\t3\t3\n\t\t');
  assert.equal(r.rowCount, 2);
  assert.deepEqual(r.items.map((i) => i.blank), [1, 1]);
});

test('유효 응답이 없는 문항은 평균 "-"', () => {
  const r = tally('번호\tQ1\n1\tx\n2\t');
  assert.deepEqual(r.items, [{ name: 'Q1', valid: 0, mean: '-', blank: 1, excluded: 1 }]);
});

test('머리글만 있으면 응답 0건, 문항은 모두 평균 "-"', () => {
  const r = tally('번호\tQ1\tQ2');
  assert.equal(r.rowCount, 0);
  assert.equal(r.items.length, 2);
  assert.ok(r.items.every((i) => i.mean === '-' && i.valid === 0 && i.blank === 0 && i.excluded === 0));
});

test('빈 입력과 문항 없는 머리글', () => {
  assert.deepEqual(tally(''), { rowCount: 0, items: [] });
  assert.deepEqual(tally('  \n \n'), { rowCount: 0, items: [] });
  assert.equal(tally('번호\n1\n2').items.length, 0);
});

test('문항 이름은 앞뒤 공백을 지우고, 비어 있으면 대체 이름', () => {
  const r = tally('번호\t 만족도 \t\n1\t5\t3');
  assert.equal(r.items[0].name, '만족도');
  assert.equal(r.items[1].name, '(제목 없음 2)');
});
