/**
 * データ検証スクリプト
 *   node scripts/validate.mjs
 * - すべての反応式が「つり合っている」「最も簡単な整数比」であることを確認
 * - 反応式に登場する化学式がすべて物質データに登録されていることを確認
 */
import { checkBalance, equationToUnicode, parseFormula } from "../src/chem.js";
import { EQUATIONS, SUBSTANCES, substanceByFormula, quizSubstances, judgeEquations, buildEquations, equationsByLevel } from "../src/data.js";

let errors = 0;

function fail(msg) {
  errors++;
  console.error("NG: " + msg);
}

// 物質データの重複チェック
const seen = new Set();
for (const s of SUBSTANCES) {
  if (seen.has(s.f)) fail("物質が重複: " + s.f);
  seen.add(s.f);
  const atoms = parseFormula(s.f);
  if (Object.keys(atoms).length === 0) fail("化学式をパースできない: " + s.f);
}

// 反応式チェック
const ids = new Set();
for (const e of EQUATIONS) {
  if (ids.has(e.id)) fail("反応式 id が重複: " + e.id);
  ids.add(e.id);

  const res = checkBalance(e);
  if (!res.balanced) {
    fail(
      e.id + " がつり合っていない: " + equationToUnicode(e) +
      "  left=" + JSON.stringify(res.leftAtoms) +
      " right=" + JSON.stringify(res.rightAtoms)
    );
  }
  if (!res.simplest) {
    fail(e.id + " の係数が最も簡単な整数比でない: " + equationToUnicode(e));
  }
  for (const side of [e.left, e.right]) {
    for (const item of side) {
      if (!substanceByFormula(item.formula)) {
        fail(e.id + " の化学式が物質データにない: " + item.formula);
      }
      if (item.coeff < 1 || item.coeff > 6 || item.coeff !== Math.floor(item.coeff)) {
        fail(e.id + " の係数が 1〜6 の整数でない: " + item.coeff);
      }
    }
  }
}

// 同じ辺に同じ化学式が2回出ていないか
// （組み立てモードは化学式から正解の係数を引くため、重複すると判定できない）
for (const e of EQUATIONS) {
  for (const [label, side] of [["左辺", e.left], ["右辺", e.right]]) {
    const seenF = new Set();
    for (const item of side) {
      if (seenF.has(item.formula)) {
        fail(e.id + " の" + label + "に同じ化学式が2回出ている: " + item.formula);
      }
      seenF.add(item.formula);
    }
  }
}

// 説明文に生成物の名前が書かれているかの検査
// 組み立てモードでは、生徒が説明文の物質名を手掛かりにカードを探すため、
// 生成物が書かれていない／名前が SUBSTANCES とずれていると問題が解けなくなる。
//
// 「銅」は「酸化銅」の、「水」は「水素」の一部でもあるため、説明文全体を対象に
// すると素通りしてしまう。そこで「〜と、」で前半（反応物・操作）と後半（生成物）に
// 分け、後半だけを検査する。この分割ができること自体が書式の検査にもなる。
function nameVariants(name) {
  // 「塩化水素（塩酸）」→ 括弧の前後どちらの表記でも可とする
  const out = [name];
  const m = name.match(/^(.+?)（(.+?)）$/);
  if (m) {
    out.push(m[1]);
    out.push(m[2]);
  }
  return out;
}

for (const e of EQUATIONS) {
  const at = e.desc.indexOf("と、");
  if (at < 0) {
    fail(
      e.id +
        " の説明文が「〈反応物〉を〈操作〉すると、〈生成物〉ができる」の書式でない: " +
        e.desc
    );
    continue;
  }
  const productPart = e.desc.slice(at + 2);
  const checked = new Set();
  for (const item of e.right) {
    if (checked.has(item.formula)) continue;
    checked.add(item.formula);
    const sub = substanceByFormula(item.formula);
    if (!sub) continue; // 物質データ未登録は上のチェックで報告済み
    const mentioned = nameVariants(sub.name).some(
      (v) => productPart.indexOf(v) >= 0
    );
    if (!mentioned) {
      fail(
        e.id + " の説明文に生成物「" + sub.name + "」が書かれていない: " + e.desc
      );
    }
  }
}

// プール数の確認（タイムアタックの出題数を満たすか）
const basicSub = quizSubstances(1).length;
const chalSub = quizSubstances(2).length;
const basicEq = equationsByLevel(1).length;
const chalEq = equationsByLevel(2).length;
const jd = judgeEquations().length;
const bd = buildEquations().length;

console.log("物質: 基本 " + basicSub + " / チャレンジ " + chalSub);
console.log("反応式: 基本 " + basicEq + " / チャレンジ " + chalEq);
console.log("○×ジャッジ対象: " + jd + " / 組み立て対象: " + bd);

if (basicSub < 20) fail("化学式マッチ（基本）の物質が 20 未満");
if (chalSub < 20) fail("化学式マッチ（チャレンジ）の物質が 20 未満");
if (basicEq < 10) fail("係数バランス（基本）の反応式が 10 未満");
if (chalEq < 10) fail("係数バランス（チャレンジ）の反応式が 10 未満");
if (jd < 20) fail("○×ジャッジの反応式が 20 未満");
if (bd < 5) fail("組み立ての反応式が 5 未満");

if (errors > 0) {
  console.error("\n" + errors + " 件のエラー");
  process.exit(1);
} else {
  console.log("\nすべて OK（" + EQUATIONS.length + " 反応式 / " + SUBSTANCES.length + " 物質）");
}
