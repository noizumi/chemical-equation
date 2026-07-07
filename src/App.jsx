import React, { useEffect, useRef, useState } from "react";
import {
  parseFormula,
  countAtoms,
  checkBalance,
  elementsInEquation,
} from "./chem.js";
import {
  EQUATIONS,
  substanceName,
  equationsByLevel,
  judgeEquations,
  buildEquations,
  quizSubstances,
} from "./data.js";

/**
 * 化学反応式マスター（中2理科「化学変化」）
 *
 * 古い iPadOS/Safari では Optional Chaining (?.) / Nullish Coalescing (??)
 * がモジュール読み込み時のエラーになるため、このファイルでは使わない。
 * （element-quiz と同じ方針）
 */

/* ================= 汎用ユーティリティ ================= */

function isNil(v) {
  return v === null || v === undefined;
}

function coalesce(v, fallback) {
  return isNil(v) ? fallback : v;
}

function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

function sampleN(array, n) {
  return shuffle(array).slice(0, n);
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function formatSeconds(sec) {
  const rounded = Math.round(sec * 10) / 10;
  return rounded.toFixed(1);
}

function posKey(side, idx) {
  return side + String(idx);
}

/* ================= モード定義 ================= */

const MODES = {
  FORMULA_BASIC: "formula_basic",
  FORMULA_CHALLENGE: "formula_challenge",
  COEFF_BASIC: "coeff_basic",
  COEFF_CHALLENGE: "coeff_challenge",
  JUDGE: "judge",
  BUILD: "build",
};

const MODE_CONFIG = {};

MODE_CONFIG[MODES.FORMULA_BASIC] = {
  title: "化学式マッチ（きほん）",
  shortLabel: "化学式・き",
  questions: 20,
  grades: { ss: 40, s: 70, a: 105, b: 150 },
  masterTitle: "化学式マスター!!",
};
MODE_CONFIG[MODES.FORMULA_CHALLENGE] = {
  title: "化学式マッチ（チャレンジ）",
  shortLabel: "化学式・チ",
  questions: 20,
  grades: { ss: 40, s: 70, a: 105, b: 150 },
  masterTitle: "化学式マスター!!",
};
MODE_CONFIG[MODES.COEFF_BASIC] = {
  title: "係数バランス（きほん）",
  shortLabel: "係数・き",
  questions: 10,
  grades: { ss: 90, s: 150, a: 240, b: 360 },
  masterTitle: "バランスマスター!!",
};
MODE_CONFIG[MODES.COEFF_CHALLENGE] = {
  title: "係数バランス（チャレンジ）",
  shortLabel: "係数・チ",
  questions: 10,
  grades: { ss: 90, s: 150, a: 240, b: 360 },
  masterTitle: "バランスマスター!!",
};
MODE_CONFIG[MODES.JUDGE] = {
  title: "○×ジャッジ",
  shortLabel: "○×",
  questions: 20,
  grades: { ss: 35, s: 55, a: 80, b: 115 },
  masterTitle: "ジャッジマスター!!",
};
MODE_CONFIG[MODES.BUILD] = {
  title: "組み立てラボ",
  shortLabel: "組み立て",
  questions: 5,
  grades: { ss: 120, s: 200, a: 300, b: 420 },
  masterTitle: "反応式マスター!!",
};

function gradeFor(mode, sec) {
  const g = MODE_CONFIG[mode].grades;
  if (sec < g.ss) {
    return {
      grade: "SS",
      title: "反応式レジェンド!!!",
      comment:
        "この速さは伝説級！原子の数が見えている者だけが到達できる領域です。",
    };
  }
  if (sec <= g.s) {
    return {
      grade: "S",
      title: MODE_CONFIG[mode].masterTitle,
      comment: "すごい！速さも正確さもバッチリ。マスターの称号を授けます！",
    };
  }
  if (sec <= g.a) {
    return {
      grade: "A",
      title: "すばらしい！",
      comment: "とても良いペース！Sランクはもう目の前です。",
    };
  }
  if (sec <= g.b) {
    return {
      grade: "B",
      title: "順調！",
      comment: "まちがえた問題を復習すると、タイムがぐっと縮みます。",
    };
  }
  return {
    grade: "C",
    title: "これから伸びる",
    comment: "あせらず1問ずつ。復習モードで確実にレベルアップしよう！",
  };
}

/* ================= ベスト記録（端末に保存） ================= */

function bestStorageKey(mode) {
  return "chemeq_best_v1_" + String(mode);
}

function readBestRecord(mode) {
  try {
    if (typeof window === "undefined") return null;
    const ls = window.localStorage;
    if (!ls) return null;
    const raw = ls.getItem(bestStorageKey(mode));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj.sec !== "number" || !isFinite(obj.sec)) return null;
    return { sec: obj.sec, at: typeof obj.at === "number" ? obj.at : null };
  } catch (e) {
    return null;
  }
}

function writeBestRecord(mode, sec) {
  try {
    if (typeof window === "undefined") return;
    const ls = window.localStorage;
    if (!ls) return;
    ls.setItem(bestStorageKey(mode), JSON.stringify({ sec: sec, at: Date.now() }));
  } catch (e) {
    // ignore
  }
}

/* ================= 化学式の表示 ================= */

function formulaSegments(formula) {
  const segs = [];
  let cur = "";
  let curSub = false;
  for (let i = 0; i < formula.length; i++) {
    const ch = formula.charAt(i);
    const isDigit = ch >= "0" && ch <= "9";
    if (isDigit !== curSub && cur !== "") {
      segs.push({ t: cur, sub: curSub });
      cur = "";
    }
    curSub = isDigit;
    cur += ch;
  }
  if (cur !== "") segs.push({ t: cur, sub: curSub });
  return segs;
}

function FormulaText(props) {
  const segs = formulaSegments(props.formula);
  return (
    <span className={coalesce(props.className, "")} style={{ whiteSpace: "nowrap" }}>
      {segs.map(function (s, i) {
        if (s.sub) {
          return (
            <sub key={i} className="chem">
              {s.t}
            </sub>
          );
        }
        return <span key={i}>{s.t}</span>;
      })}
    </span>
  );
}

/**
 * 完成した反応式の表示（係数 1 は省略する正式な書き方）
 * leftCoeffs / rightCoeffs を渡すとその係数で表示する
 */
function EquationStatic(props) {
  const eq = props.eq;
  const leftCoeffs = props.leftCoeffs;
  const rightCoeffs = props.rightCoeffs;
  const size = coalesce(props.size, "text-xl sm:text-2xl");

  function renderSide(side, coeffs, keyPrefix) {
    const nodes = [];
    for (let i = 0; i < side.length; i++) {
      if (i > 0) {
        nodes.push(
          <span key={keyPrefix + "p" + i} className="mx-1.5 text-white/60">
            ＋
          </span>
        );
      }
      const c = coeffs ? coeffs[i] : side[i].coeff;
      if (c > 1) {
        nodes.push(
          <span key={keyPrefix + "c" + i} className="mr-0.5 font-black text-amber-300">
            {c}
          </span>
        );
      }
      nodes.push(
        <FormulaText key={keyPrefix + "f" + i} formula={side[i].formula} className="font-black" />
      );
    }
    return nodes;
  }

  return (
    <span
      className={
        "inline-flex flex-wrap items-baseline justify-center leading-relaxed " + size
      }
    >
      {renderSide(eq.left, leftCoeffs, "L")}
      <span className="mx-2 font-black text-sky-300">→</span>
      {renderSide(eq.right, rightCoeffs, "R")}
    </span>
  );
}

/* ================= 原子カウント（ヒント）パネル ================= */

function AtomHintPanel(props) {
  const eq = props.eq;
  const leftCoeffs = props.leftCoeffs; // null 要素は 0 として数える
  const rightCoeffs = props.rightCoeffs;

  function toNums(coeffs, side) {
    const out = [];
    for (let i = 0; i < side.length; i++) {
      const v = coeffs ? coeffs[i] : side[i].coeff;
      out.push(typeof v === "number" ? v : 0);
    }
    return out;
  }

  const la = countAtoms(eq.left, toNums(leftCoeffs, eq.left));
  const ra = countAtoms(eq.right, toNums(rightCoeffs, eq.right));
  const els = elementsInEquation(eq);

  return (
    <div className="mx-auto mt-4 w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-3 animate-fadein">
      <div className="mb-2 text-center text-[11px] font-bold text-white/60">
        原子の数をチェック（左辺 : 右辺）
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {els.map(function (el) {
          const l = coalesce(la[el], 0);
          const r = coalesce(ra[el], 0);
          const ok = l === r && l > 0;
          return (
            <div
              key={el}
              className={
                "flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-sm font-black " +
                (ok
                  ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                  : "border-rose-400/40 bg-rose-500/15 text-rose-200")
              }
            >
              <span>{el}</span>
              <span className="text-xs font-bold opacity-90">
                {l} : {r}
              </span>
              <span>{ok ? "○" : "×"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================= 問題の生成 ================= */

const ELEMENTS_CACHE = {};
function elementsOf(formula) {
  if (!ELEMENTS_CACHE[formula]) {
    const atoms = parseFormula(formula);
    const list = [];
    for (const el in atoms) {
      if (Object.prototype.hasOwnProperty.call(atoms, el)) list.push(el);
    }
    ELEMENTS_CACHE[formula] = list;
  }
  return ELEMENTS_CACHE[formula];
}

function sharedElementCount(fa, fb) {
  const ea = elementsOf(fa);
  const eb = elementsOf(fb);
  let count = 0;
  for (let i = 0; i < ea.length; i++) {
    if (eb.indexOf(ea[i]) >= 0) count++;
  }
  return count;
}

function pickDistractors(answer, pool, n) {
  const scored = [];
  for (let i = 0; i < pool.length; i++) {
    const s = pool[i];
    if (s.f === answer.f) continue;
    const score = sharedElementCount(answer.f, s.f) * 2 + Math.random() * 2.5;
    scored.push({ s: s, score: score });
  }
  scored.sort(function (x, y) {
    return y.score - x.score;
  });
  const out = [];
  for (let i = 0; i < scored.length && out.length < n; i++) {
    out.push(scored[i].s);
  }
  return out;
}

function makeFormulaQuestions(level) {
  const pool = quizSubstances(level);
  const subs = sampleN(pool, 20);
  return subs.map(function (sub) {
    const dir = Math.random() < 0.5 ? "n2f" : "f2n";
    const options = shuffle([sub].concat(pickDistractors(sub, pool, 3)));
    return { kind: "formula", sub: sub, dir: dir, options: options };
  });
}

function makeCoeffQuestions(level) {
  const pool = equationsByLevel(level);
  return sampleN(pool, 10).map(function (eq) {
    return { kind: "coeff", eq: eq };
  });
}

function coeffsOf(side) {
  const out = [];
  for (let i = 0; i < side.length; i++) out.push(side[i].coeff);
  return out;
}

function makeJudgeQuestion(eq, wantWrong) {
  const lc = coeffsOf(eq.left);
  const rc = coeffsOf(eq.right);
  if (!wantWrong) {
    return { kind: "judge", eq: eq, shownLeft: lc, shownRight: rc, correct: true };
  }
  // 係数を 1〜2 か所だけ変えて、必ずつり合わない式を作る
  for (let attempt = 0; attempt < 60; attempt++) {
    const wl = lc.slice();
    const wr = rc.slice();
    const changes = Math.random() < 0.3 ? 2 : 1;
    for (let c = 0; c < changes; c++) {
      const total = wl.length + wr.length;
      const pos = randInt(0, total - 1);
      const arr = pos < wl.length ? wl : wr;
      const idx = pos < wl.length ? pos : pos - wl.length;
      const orig = arr[idx];
      let next = orig;
      if (Math.random() < 0.6) {
        next = orig + (Math.random() < 0.5 ? -1 : 1);
        if (next < 1) next = orig + 1;
        if (next > 6) next = orig - 1;
      } else {
        while (next === orig) next = randInt(1, 4);
      }
      arr[idx] = next;
    }
    const res = checkBalance(eq, wl, wr);
    if (!res.balanced) {
      return { kind: "judge", eq: eq, shownLeft: wl, shownRight: wr, correct: false };
    }
  }
  // 保険（通常は到達しない）：左辺先頭の係数を +1
  const wl2 = lc.slice();
  wl2[0] = wl2[0] + 1;
  return { kind: "judge", eq: eq, shownLeft: wl2, shownRight: rc, correct: false };
}

function makeJudgeQuestions() {
  const pool = judgeEquations();
  const eqs = sampleN(pool, 20);
  const flags = [];
  for (let i = 0; i < eqs.length; i++) flags.push(i % 2 === 0);
  const shuffledFlags = shuffle(flags);
  return eqs.map(function (eq, i) {
    return makeJudgeQuestion(eq, shuffledFlags[i]);
  });
}

function uniqueFormulasOf(eq) {
  const list = [];
  function collect(side) {
    for (let i = 0; i < side.length; i++) {
      if (list.indexOf(side[i].formula) < 0) list.push(side[i].formula);
    }
  }
  collect(eq.left);
  collect(eq.right);
  return list;
}

function makeBuildCards(eq) {
  const correct = uniqueFormulasOf(eq);
  const eqEls = elementsInEquation(eq);
  const wanted = Math.max(0, 8 - correct.length);
  const scored = [];
  const all = quizSubstances(1).concat(quizSubstances(2));
  for (let i = 0; i < all.length; i++) {
    const s = all[i];
    if (correct.indexOf(s.f) >= 0) continue;
    let shared = 0;
    const els = elementsOf(s.f);
    for (let k = 0; k < els.length; k++) {
      if (eqEls.indexOf(els[k]) >= 0) shared++;
    }
    if (shared === 0) continue;
    scored.push({ f: s.f, score: shared * 2 + Math.random() * 3 });
  }
  scored.sort(function (x, y) {
    return y.score - x.score;
  });
  const distractors = [];
  for (let i = 0; i < scored.length && distractors.length < wanted; i++) {
    distractors.push(scored[i].f);
  }
  return shuffle(correct.concat(distractors));
}

function makeBuildQuestions() {
  const pool = buildEquations();
  return sampleN(pool, 5).map(function (eq) {
    return { kind: "build", eq: eq, cards: makeBuildCards(eq) };
  });
}

function buildQuestionsForMode(mode) {
  if (mode === MODES.FORMULA_BASIC) return makeFormulaQuestions(1);
  if (mode === MODES.FORMULA_CHALLENGE) return makeFormulaQuestions(2);
  if (mode === MODES.COEFF_BASIC) return makeCoeffQuestions(1);
  if (mode === MODES.COEFF_CHALLENGE) return makeCoeffQuestions(2);
  if (mode === MODES.JUDGE) return makeJudgeQuestions();
  return makeBuildQuestions();
}

/* ================= セルフテスト ================= */

function runSelfTests() {
  try {
    console.assert(
      JSON.stringify(parseFormula("Ca(OH)2")) === JSON.stringify({ Ca: 1, O: 2, H: 2 }),
      "parseFormula Ca(OH)2"
    );
    for (let i = 0; i < EQUATIONS.length; i++) {
      const res = checkBalance(EQUATIONS[i]);
      console.assert(
        res.balanced && res.simplest,
        "equation balanced: " + EQUATIONS[i].id
      );
    }
    for (let i = 0; i < 30; i++) {
      const eq = EQUATIONS[randInt(0, EQUATIONS.length - 1)];
      const q = makeJudgeQuestion(eq, true);
      const res = checkBalance(eq, q.shownLeft, q.shownRight);
      console.assert(!res.balanced, "judge wrong version is unbalanced");
    }
  } catch (e) {
    // テスト失敗でもアプリは止めない
    console.log("selftest error", e);
  }
}

/* ================= 小さな UI 部品 ================= */

function ActionButton(props) {
  const variant = coalesce(props.variant, "primary");
  const compact = !!props.compact;
  const base =
    "w-full rounded-2xl px-4 font-black shadow-sm transition active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 " +
    (compact ? "py-3 text-sm" : "py-4 text-base");
  if (variant === "primary") {
    return (
      <button
        type="button"
        onClick={props.onClick}
        disabled={props.disabled}
        className={
          base +
          " " +
          (props.disabled
            ? "bg-white/10 text-white/35"
            : "bg-white text-slate-950 hover:bg-white/95")
        }
      >
        {props.children}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className={
        base +
        " border border-white/10 bg-white/5 text-white/85 hover:bg-white/10 " +
        (props.disabled ? "opacity-50" : "")
      }
    >
      {props.children}
    </button>
  );
}

function Chip(props) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-white/70">
      {props.children}
    </span>
  );
}

function Overlay(props) {
  const kind = props.kind; // correct | wrong | info
  const styles = {
    correct: "bg-emerald-500/15 border-emerald-400/30",
    wrong: "bg-rose-500/15 border-rose-400/30",
    info: "bg-amber-500/15 border-amber-400/30",
  };
  const accent = {
    correct: "text-emerald-200",
    wrong: "text-rose-200",
    info: "text-amber-200",
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-6 animate-fadein"
      role="status"
      aria-live="polite"
    >
      <div
        className={
          "w-full max-w-md rounded-3xl border backdrop-blur-md animate-popin " +
          styles[kind]
        }
      >
        <div className="px-6 py-7 text-center">
          <div className={"text-4xl font-black tracking-tight " + accent[kind]}>
            {props.title}
          </div>
          {props.sub ? (
            <div className="mt-2 text-sm font-bold text-white/75">{props.sub}</div>
          ) : null}
          {props.children ? <div className="mt-3">{props.children}</div> : null}
        </div>
      </div>
    </div>
  );
}

function HelpModal(props) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-5 animate-fadein"
      role="dialog"
      aria-modal="true"
      aria-label="あそび方"
      onClick={props.onClose}
    >
      <div className="absolute inset-0 bg-black/60" aria-hidden="true" />
      <div
        className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl border border-white/10 bg-slate-950/85 p-5 shadow-xl backdrop-blur-xl animate-popin"
        onClick={function (e) {
          e.stopPropagation();
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-white/70">あそび方</div>
            <div className="text-lg font-black tracking-tight text-white">
              化学反応式マスター
            </div>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-white/80 hover:bg-white/10"
          >
            とじる
          </button>
        </div>

        <div className="mt-4 space-y-3 text-sm text-white/80">
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-3">
            <div className="font-black text-cyan-200">STEP1 化学式マッチ</div>
            <div className="mt-1">
              物質名と化学式を対応づけよう。正しい選択肢をタップ！
            </div>
          </div>
          <div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-3">
            <div className="font-black text-violet-200">STEP2 係数バランス</div>
            <div className="mt-1">
              マスをタップ → 数字をタップで係数を入力。左右の原子の数がそろったら正解！
              係数は<span className="font-black">最も簡単な整数比</span>で。
              ふつう「1」は書かないけど、このゲームでは 1 も入力してね。
            </div>
          </div>
          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3">
            <div className="font-black text-amber-200">STEP3 ○×ジャッジ</div>
            <div className="mt-1">
              表示された反応式がつり合っていれば○、まちがっていれば×を瞬時に判定！
              ミスすると＋3秒のペナルティ。
            </div>
          </div>
          <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-3">
            <div className="font-black text-rose-200">STEP4 組み立てラボ</div>
            <div className="mt-1">
              実験の説明文を読んで、カードから物質を選び、係数も入れて反応式を完成させよう。
            </div>
          </div>
          <ul className="space-y-1 pl-1 text-xs text-white/65">
            <li>・スタート後 3・2・1 のカウントダウンでタイムアタック開始。</li>
            <li>・まちがえても続行できるけど、その分タイムがかかるよ。</li>
            <li>・結果画面の「復習」で、まちがえた問題だけやり直せる。</li>
            <li>・ベスト記録はこの端末に保存される。</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ================= ホーム画面のモードカード ================= */

const ACCENT_STYLES = {
  cyan: {
    card: "border-cyan-400/25 bg-cyan-500/10",
    badge: "bg-cyan-400/20 text-cyan-100 border-cyan-300/30",
  },
  violet: {
    card: "border-violet-400/25 bg-violet-500/10",
    badge: "bg-violet-400/20 text-violet-100 border-violet-300/30",
  },
  amber: {
    card: "border-amber-400/25 bg-amber-500/10",
    badge: "bg-amber-400/20 text-amber-100 border-amber-300/30",
  },
  rose: {
    card: "border-rose-400/25 bg-rose-500/10",
    badge: "bg-rose-400/20 text-rose-100 border-rose-300/30",
  },
};

function ModeCard(props) {
  const st = ACCENT_STYLES[props.accent];
  return (
    <div className={"relative w-full rounded-3xl border p-4 shadow-sm " + st.card}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black " +
                st.badge
              }
            >
              {props.step}
            </span>
            <span className="text-base font-black tracking-tight text-white">
              {props.title}
            </span>
          </div>
          <div className="mt-1.5 text-xs leading-relaxed text-white/60">
            {props.detail}
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-2">{props.children}</div>
    </div>
  );
}

function StartButton(props) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="flex-1 rounded-2xl border border-white/15 bg-white/10 px-3 py-3 text-sm font-black text-white transition hover:bg-white/15 active:scale-[0.99]"
    >
      {props.children}
    </button>
  );
}

/* ================= メインアプリ ================= */

export default function App() {
  const [screen, setScreen] = useState("home"); // home | countdown | run | result
  const [mode, setMode] = useState(MODES.FORMULA_BASIC);
  const [phase, setPhase] = useState("main"); // main | review
  const [countdownStep, setCountdownStep] = useState(0);

  const [questions, setQuestions] = useState([]);
  const [qIndex, setQIndex] = useState(0);
  const questionsRef = useRef([]);
  const qIndexRef = useRef(0);

  const [elapsed, setElapsed] = useState(0);
  const startMsRef = useRef(null);
  const penaltyRef = useRef(0);
  const [penaltySec, setPenaltySec] = useState(0);

  const missedRef = useRef({});
  const [wrongTaps, setWrongTaps] = useState(0);

  const [overlay, setOverlay] = useState(null);
  const advanceTimerRef = useRef(null);
  const flashTimerRef = useRef(null);
  const toastTimerRef = useRef(null);
  const [toast, setToast] = useState(null);

  // 化学式マッチ用
  const [disabledOpts, setDisabledOpts] = useState({});
  const [optFlash, setOptFlash] = useState(null);

  // 係数バランス・組み立て用
  const [coeffL, setCoeffL] = useState([]);
  const [coeffR, setCoeffR] = useState([]);
  const [subL, setSubL] = useState([]);
  const [subR, setSubR] = useState([]);
  const [selPos, setSelPos] = useState({ side: "L", idx: 0 });
  const [hintOn, setHintOn] = useState(false);
  const [badPos, setBadPos] = useState({});
  const [shakeKey, setShakeKey] = useState(0);
  const [checkLock, setCheckLock] = useState(false);

  const [lastResult, setLastResult] = useState(null);
  const [bestByMode, setBestByMode] = useState({});
  const [showHelp, setShowHelp] = useState(false);

  /* ---------- 初期化 ---------- */

  useEffect(function () {
    runSelfTests();
    const map = {};
    const keys = [
      MODES.FORMULA_BASIC,
      MODES.FORMULA_CHALLENGE,
      MODES.COEFF_BASIC,
      MODES.COEFF_CHALLENGE,
      MODES.JUDGE,
      MODES.BUILD,
    ];
    for (let i = 0; i < keys.length; i++) {
      const rec = readBestRecord(keys[i]);
      if (rec) map[keys[i]] = rec;
    }
    setBestByMode(map);
    return function () {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  /* ---------- タイマー ---------- */

  useEffect(
    function () {
      if (screen !== "run") return undefined;
      const t = setInterval(function () {
        if (startMsRef.current !== null) {
          setElapsed(
            (Date.now() - startMsRef.current) / 1000 + penaltyRef.current
          );
        }
      }, 100);
      return function () {
        clearInterval(t);
      };
    },
    [screen]
  );

  /* ---------- カウントダウン ---------- */

  useEffect(
    function () {
      if (screen !== "countdown") return undefined;
      if (countdownStep < 3) {
        const t = setTimeout(function () {
          setCountdownStep(countdownStep + 1);
        }, 650);
        return function () {
          clearTimeout(t);
        };
      }
      const t2 = setTimeout(function () {
        startMsRef.current = Date.now();
        setElapsed(0);
        setScreen("run");
      }, 500);
      return function () {
        clearTimeout(t2);
      };
    },
    [screen, countdownStep]
  );

  /* ---------- 実行制御 ---------- */

  function clearTransientTimers() {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    if (flashTimerRef.current) {
      clearTimeout(flashTimerRef.current);
      flashTimerRef.current = null;
    }
  }

  function resetQuestionState(q) {
    setDisabledOpts({});
    setOptFlash(null);
    setHintOn(false);
    setBadPos({});
    setCheckLock(false);
    setOverlay(null);
    if (q && q.kind === "coeff") {
      const l = [];
      const r = [];
      for (let i = 0; i < q.eq.left.length; i++) l.push(null);
      for (let i = 0; i < q.eq.right.length; i++) r.push(null);
      setCoeffL(l);
      setCoeffR(r);
      setSelPos({ side: "L", idx: 0 });
    }
    if (q && q.kind === "build") {
      const l = [];
      const r = [];
      const sl = [];
      const sr = [];
      for (let i = 0; i < q.eq.left.length; i++) {
        l.push(null);
        sl.push(null);
      }
      for (let i = 0; i < q.eq.right.length; i++) {
        r.push(null);
        sr.push(null);
      }
      setCoeffL(l);
      setCoeffR(r);
      setSubL(sl);
      setSubR(sr);
      setSelPos({ side: "L", idx: 0 });
    }
  }

  function startRun(nextMode, nextPhase, qs) {
    clearTransientTimers();
    setMode(nextMode);
    setPhase(nextPhase);
    setQuestions(qs);
    questionsRef.current = qs;
    setQIndex(0);
    qIndexRef.current = 0;
    missedRef.current = {};
    penaltyRef.current = 0;
    setPenaltySec(0);
    setWrongTaps(0);
    setToast(null);
    resetQuestionState(qs[0]);
    setCountdownStep(0);
    setScreen("countdown");
  }

  function startMode(nextMode) {
    startRun(nextMode, "main", buildQuestionsForMode(nextMode));
  }

  function startReview() {
    if (!lastResult || !lastResult.missedQuestions.length) return;
    startRun(lastResult.mode, "review", shuffle(lastResult.missedQuestions));
  }

  function markMissed() {
    missedRef.current[qIndexRef.current] = true;
    setWrongTaps(function (w) {
      return w + 1;
    });
  }

  function finishRun() {
    const sec =
      (startMsRef.current !== null
        ? (Date.now() - startMsRef.current) / 1000
        : 0) + penaltyRef.current;
    const qs = questionsRef.current;
    const missedQuestions = [];
    for (let i = 0; i < qs.length; i++) {
      if (missedRef.current[i]) missedQuestions.push(qs[i]);
    }
    let isNewBest = false;
    if (phase === "main") {
      const prev = bestByMode[mode];
      if (!prev || sec < prev.sec) {
        isNewBest = true;
        writeBestRecord(mode, sec);
        const nextMap = {};
        for (const k in bestByMode) {
          if (Object.prototype.hasOwnProperty.call(bestByMode, k)) {
            nextMap[k] = bestByMode[k];
          }
        }
        nextMap[mode] = { sec: sec, at: Date.now() };
        setBestByMode(nextMap);
      }
    }
    setLastResult({
      mode: mode,
      phase: phase,
      sec: sec,
      missedQuestions: missedQuestions,
      isNewBest: isNewBest,
    });
    setOverlay(null);
    setScreen("result");
  }

  function goNext() {
    clearTransientTimers();
    setOverlay(null);
    const next = qIndexRef.current + 1;
    if (next >= questionsRef.current.length) {
      finishRun();
      return;
    }
    qIndexRef.current = next;
    setQIndex(next);
    resetQuestionState(questionsRef.current[next]);
  }

  function scheduleAdvance(ms) {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    advanceTimerRef.current = setTimeout(goNext, ms);
  }

  function quitToHome() {
    clearTransientTimers();
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(null);
    setOverlay(null);
    setScreen("home");
  }

  function showToast(text) {
    setToast({ text: text, key: Date.now() });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(function () {
      setToast(null);
    }, 1600);
  }

  /* ---------- 化学式マッチ ---------- */

  function onTapFormulaOption(idx) {
    const q = questionsRef.current[qIndexRef.current];
    if (!q || q.kind !== "formula") return;
    if (overlay) return;
    if (optFlash && optFlash.kind === "correct") return; // 正解直後の連続タップを無視
    if (disabledOpts[idx]) return;
    const opt = q.options[idx];
    if (opt.f === q.sub.f) {
      setOptFlash({ idx: idx, kind: "correct" });
      scheduleAdvance(300);
    } else {
      markMissed();
      setOptFlash({ idx: idx, kind: "wrong" });
      const nextDisabled = {};
      for (const k in disabledOpts) {
        if (Object.prototype.hasOwnProperty.call(disabledOpts, k)) {
          nextDisabled[k] = true;
        }
      }
      nextDisabled[idx] = true;
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(function () {
        setOptFlash(null);
      }, 350);
      setDisabledOpts(nextDisabled);
    }
  }

  /* ---------- 係数バランス ---------- */

  function currentSlots(q) {
    // 係数スロットの一覧（選択の自動送りに使う）
    const list = [];
    for (let i = 0; i < q.eq.left.length; i++) list.push({ side: "L", idx: i });
    for (let i = 0; i < q.eq.right.length; i++) list.push({ side: "R", idx: i });
    return list;
  }

  function coeffValueAt(side, idx) {
    return side === "L" ? coeffL[idx] : coeffR[idx];
  }

  function setCoeffValue(side, idx, value) {
    if (side === "L") {
      setCoeffL(function (prev) {
        const next = prev.slice();
        next[idx] = value;
        return next;
      });
    } else {
      setCoeffR(function (prev) {
        const next = prev.slice();
        next[idx] = value;
        return next;
      });
    }
  }

  function advanceSelection(q, fromSide, fromIdx, filledSide, filledIdx, forCoeff) {
    // filledSide/filledIdx に今入力した。次の空きスロットを選ぶ
    const slots = currentSlots(q);
    let start = 0;
    for (let i = 0; i < slots.length; i++) {
      if (slots[i].side === fromSide && slots[i].idx === fromIdx) {
        start = i;
        break;
      }
    }
    for (let step = 1; step <= slots.length; step++) {
      const s = slots[(start + step) % slots.length];
      let empty;
      if (q.kind === "build" && !forCoeff) {
        const arr = s.side === "L" ? subL : subR;
        empty = arr[s.idx] === null && !(s.side === filledSide && s.idx === filledIdx);
      } else {
        const arr = s.side === "L" ? coeffL : coeffR;
        empty = arr[s.idx] === null && !(s.side === filledSide && s.idx === filledIdx);
      }
      if (empty) {
        setSelPos({ side: s.side, idx: s.idx });
        return;
      }
    }
    // 空きがなければそのまま
    setSelPos({ side: fromSide, idx: fromIdx });
  }

  function onTapNumber(n) {
    const q = questionsRef.current[qIndexRef.current];
    if (!q || (q.kind !== "coeff" && q.kind !== "build")) return;
    if (overlay || checkLock) return;
    setCoeffValue(selPos.side, selPos.idx, n);
    // 次の空き係数スロットへ
    const slots = currentSlots(q);
    let start = 0;
    for (let i = 0; i < slots.length; i++) {
      if (slots[i].side === selPos.side && slots[i].idx === selPos.idx) {
        start = i;
        break;
      }
    }
    for (let step = 1; step <= slots.length; step++) {
      const s = slots[(start + step) % slots.length];
      const arr = s.side === "L" ? coeffL : coeffR;
      if (arr[s.idx] === null) {
        setSelPos({ side: s.side, idx: s.idx });
        return;
      }
    }
  }

  function allCoeffFilled(q) {
    for (let i = 0; i < q.eq.left.length; i++) {
      if (coeffL[i] === null || coeffL[i] === undefined) return false;
    }
    for (let i = 0; i < q.eq.right.length; i++) {
      if (coeffR[i] === null || coeffR[i] === undefined) return false;
    }
    return true;
  }

  function onCheckCoeff() {
    const q = questionsRef.current[qIndexRef.current];
    if (!q || q.kind !== "coeff") return;
    if (overlay || checkLock) return;
    if (!allCoeffFilled(q)) return;
    const res = checkBalance(q.eq, coeffL, coeffR);
    if (res.balanced && res.simplest) {
      setCheckLock(true);
      setOverlay({
        kind: "correct",
        title: "せいかい！",
        sub: q.eq.desc,
        node: (
          <EquationStatic eq={q.eq} leftCoeffs={coeffL} rightCoeffs={coeffR} />
        ),
      });
      scheduleAdvance(1400);
    } else if (res.balanced && !res.simplest) {
      showToast("つり合っているけど…もっと簡単な整数比にできるよ！");
      setShakeKey(function (k) {
        return k + 1;
      });
    } else {
      markMissed();
      setHintOn(true);
      setShakeKey(function (k) {
        return k + 1;
      });
    }
  }

  /* ---------- 組み立てラボ ---------- */

  function subValueAt(side, idx) {
    return side === "L" ? subL[idx] : subR[idx];
  }

  function setSubValue(side, idx, value) {
    if (side === "L") {
      setSubL(function (prev) {
        const next = prev.slice();
        next[idx] = value;
        return next;
      });
    } else {
      setSubR(function (prev) {
        const next = prev.slice();
        next[idx] = value;
        return next;
      });
    }
  }

  function usedCardFormulas() {
    const used = {};
    for (let i = 0; i < subL.length; i++) {
      if (subL[i]) used[subL[i]] = { side: "L", idx: i };
    }
    for (let i = 0; i < subR.length; i++) {
      if (subR[i]) used[subR[i]] = { side: "R", idx: i };
    }
    return used;
  }

  function onTapCard(formula) {
    const q = questionsRef.current[qIndexRef.current];
    if (!q || q.kind !== "build") return;
    if (overlay || checkLock) return;
    setBadPos({});
    const used = usedCardFormulas();
    if (used[formula]) {
      // 使用中カードをタップ → その場所から外して選び直せるようにする
      const pos = used[formula];
      setSubValue(pos.side, pos.idx, null);
      setSelPos({ side: pos.side, idx: pos.idx });
      return;
    }
    // 選択中の位置に置く（置きかえも可）
    setSubValue(selPos.side, selPos.idx, formula);
    advanceSelection(q, selPos.side, selPos.idx, selPos.side, selPos.idx, false);
  }

  function allSubsFilled(q) {
    for (let i = 0; i < q.eq.left.length; i++) {
      if (!subL[i]) return false;
    }
    for (let i = 0; i < q.eq.right.length; i++) {
      if (!subR[i]) return false;
    }
    return true;
  }

  function buildChosenEq(q) {
    // ユーザーの並びで擬似反応式を作る（原子カウントパネル用）
    function side(subArr, srcSide) {
      const out = [];
      for (let i = 0; i < srcSide.length; i++) {
        out.push({ coeff: 1, formula: subArr[i] ? subArr[i] : "H" });
      }
      return out;
    }
    return {
      left: side(subL, q.eq.left),
      right: side(subR, q.eq.right),
    };
  }

  function onCheckBuild() {
    const q = questionsRef.current[qIndexRef.current];
    if (!q || q.kind !== "build") return;
    if (overlay || checkLock) return;
    if (!allSubsFilled(q) || !allCoeffFilled(q)) return;

    // 1) 物質の組み合わせを判定（左右それぞれ、順序は不問）
    function sideCheck(chosen, expectedSide) {
      const remaining = [];
      for (let i = 0; i < expectedSide.length; i++) {
        remaining.push(expectedSide[i].formula);
      }
      const bad = [];
      for (let i = 0; i < chosen.length; i++) {
        const at = remaining.indexOf(chosen[i]);
        if (at >= 0) {
          remaining.splice(at, 1);
        } else {
          bad.push(i);
        }
      }
      return bad;
    }
    const badL = sideCheck(subL, q.eq.left);
    const badR = sideCheck(subR, q.eq.right);
    if (badL.length > 0 || badR.length > 0) {
      markMissed();
      const bp = {};
      for (let i = 0; i < badL.length; i++) bp[posKey("L", badL[i])] = true;
      for (let i = 0; i < badR.length; i++) bp[posKey("R", badR[i])] = true;
      setBadPos(bp);
      setShakeKey(function (k) {
        return k + 1;
      });
      showToast("赤いわくの物質を見直そう！");
      return;
    }

    // 2) 係数を判定（各化学式に対応する正しい係数と比較）
    function expectedCoeffFor(expectedSide, formula) {
      for (let i = 0; i < expectedSide.length; i++) {
        if (expectedSide[i].formula === formula) return expectedSide[i].coeff;
      }
      return -1;
    }
    let ok = true;
    for (let i = 0; i < subL.length; i++) {
      if (coeffL[i] !== expectedCoeffFor(q.eq.left, subL[i])) ok = false;
    }
    for (let i = 0; i < subR.length; i++) {
      if (coeffR[i] !== expectedCoeffFor(q.eq.right, subR[i])) ok = false;
    }

    if (ok) {
      setCheckLock(true);
      setOverlay({
        kind: "correct",
        title: "せいかい！",
        sub: q.eq.desc,
        node: <EquationStatic eq={q.eq} />,
      });
      scheduleAdvance(1500);
    } else {
      markMissed();
      setHintOn(true);
      setShakeKey(function (k) {
        return k + 1;
      });
      // つり合っているが最簡でない場合のメッセージ
      const chosen = buildChosenEq(q);
      const res = checkBalance(
        { left: chosen.left, right: chosen.right },
        coeffL,
        coeffR
      );
      if (res.balanced && !res.simplest) {
        showToast("つり合っているけど…もっと簡単な整数比にできるよ！");
      }
    }
  }

  /* ---------- ○×ジャッジ ---------- */

  function onJudge(saidCorrect) {
    const q = questionsRef.current[qIndexRef.current];
    if (!q || q.kind !== "judge") return;
    if (overlay || checkLock) return;
    setCheckLock(true);
    const right = saidCorrect === q.correct;
    if (right) {
      if (q.correct) {
        setOverlay({ kind: "correct", title: "せいかい！", sub: "つり合っている！" });
        scheduleAdvance(450);
      } else {
        setOverlay({
          kind: "correct",
          title: "せいかい！",
          sub: "正しくはこう：",
          node: <EquationStatic eq={q.eq} />,
        });
        scheduleAdvance(900);
      }
    } else {
      markMissed();
      penaltyRef.current += 3;
      setPenaltySec(penaltyRef.current);
      setOverlay({
        kind: "wrong",
        title: "ざんねん…（＋3秒）",
        sub: q.correct ? "これは正しい式だった！" : "正しくはこう：",
        node: <EquationStatic eq={q.eq} />,
      });
      scheduleAdvance(1500);
    }
  }

  /* ================= 描画 ================= */

  const currentQ = questions[qIndex];

  function renderHeader() {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-xs font-bold text-white/55">
            {MODE_CONFIG[mode].title}
            {phase === "review" ? "（復習）" : ""}
          </div>
          <div className="text-lg font-black tabular-nums text-white">
            {qIndex + 1}
            <span className="text-white/50"> / {questions.length}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {penaltySec > 0 ? (
            <span className="rounded-full border border-rose-400/40 bg-rose-500/15 px-2.5 py-1 text-xs font-black text-rose-200">
              ＋{penaltySec}s
            </span>
          ) : null}
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5 text-lg font-black tabular-nums text-white">
            {formatSeconds(elapsed)}
            <span className="ml-0.5 text-xs font-bold text-white/50">s</span>
          </div>
          <button
            type="button"
            onClick={quitToHome}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-white/70 hover:bg-white/10"
          >
            やめる
          </button>
        </div>
      </div>
    );
  }

  function renderProgressBar() {
    const pct = questions.length
      ? Math.round((qIndex / questions.length) * 100)
      : 0;
    return (
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-sky-400/80 transition-all duration-300"
          style={{ width: String(pct) + "%" }}
        />
      </div>
    );
  }

  /* ----- 化学式マッチ画面 ----- */

  function renderFormulaRun(q) {
    const isN2F = q.dir === "n2f";
    return (
      <div className="mt-6">
        <div className="rounded-3xl border border-white/10 bg-white/5 px-5 py-8 text-center">
          <div className="text-xs font-bold text-white/55">
            {isN2F ? "この物質の化学式は？" : "この化学式の物質名は？"}
          </div>
          <div className="mt-3">
            {isN2F ? (
              <span className="text-3xl font-black tracking-tight sm:text-4xl">
                {q.sub.name}
              </span>
            ) : (
              <FormulaText
                formula={q.sub.f}
                className="text-4xl font-black tracking-tight sm:text-5xl"
              />
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {q.options.map(function (opt, idx) {
            const disabled = !!disabledOpts[idx];
            const flashKind =
              optFlash && optFlash.idx === idx ? optFlash.kind : null;
            const styleObj = {};
            if (flashKind === "correct") {
              styleObj.outline = "3px solid rgba(52,211,153,0.95)";
              styleObj.outlineOffset = "-3px";
              styleObj.boxShadow = "0 0 0 5px rgba(52,211,153,0.18)";
            }
            if (flashKind === "wrong") {
              styleObj.outline = "3px solid rgba(251,113,133,0.95)";
              styleObj.outlineOffset = "-3px";
              styleObj.boxShadow = "0 0 0 5px rgba(251,113,133,0.18)";
            }
            return (
              <button
                key={idx}
                type="button"
                disabled={disabled}
                onClick={function () {
                  onTapFormulaOption(idx);
                }}
                style={Object.keys(styleObj).length ? styleObj : undefined}
                className={
                  "flex min-h-[72px] items-center justify-center rounded-2xl border px-3 py-4 text-center transition active:scale-[0.99] " +
                  (disabled
                    ? "border-white/10 bg-white/5 text-white/30"
                    : "border-white/10 bg-white/10 text-white hover:bg-white/15")
                }
              >
                {isN2F ? (
                  <FormulaText formula={opt.f} className="text-2xl font-black" />
                ) : (
                  <span className="text-base font-black leading-snug sm:text-lg">
                    {opt.name}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  /* ----- 係数スロット ----- */

  function CoeffSlotButton(props) {
    const selected = props.selected;
    const value = props.value;
    return (
      <button
        type="button"
        onClick={props.onClick}
        className={
          "mr-0.5 inline-flex h-12 w-10 items-center justify-center rounded-xl border-2 align-middle text-xl font-black transition " +
          (selected
            ? "border-sky-400 bg-sky-400/25 text-white"
            : value === null
              ? "border-dashed border-white/30 bg-white/5 text-white/35"
              : "border-white/15 bg-white/10 text-amber-300")
        }
        style={
          selected
            ? { boxShadow: "0 0 0 4px rgba(56,189,248,0.18)" }
            : undefined
        }
      >
        {value === null ? "?" : value}
      </button>
    );
  }

  function renderCoeffEquation(q) {
    function renderSide(side, sideKey) {
      const nodes = [];
      for (let i = 0; i < side.length; i++) {
        if (i > 0) {
          nodes.push(
            <span key={sideKey + "p" + i} className="mx-1.5 text-white/60 text-2xl font-black">
              ＋
            </span>
          );
        }
        const value = sideKey === "L" ? coeffL[i] : coeffR[i];
        const selected = selPos.side === sideKey && selPos.idx === i;
        nodes.push(
          <span key={sideKey + "t" + i} className="inline-flex items-center whitespace-nowrap py-1">
            <CoeffSlotButton
              value={isNil(value) ? null : value}
              selected={selected}
              onClick={function () {
                setSelPos({ side: sideKey, idx: i });
              }}
            />
            <FormulaText
              formula={side[i].formula}
              className="text-2xl font-black sm:text-3xl"
            />
          </span>
        );
      }
      return nodes;
    }
    return (
      <div
        key={shakeKey}
        className={
          "flex flex-wrap items-center justify-center " +
          (shakeKey > 0 ? "animate-shake" : "")
        }
      >
        {renderSide(q.eq.left, "L")}
        <span className="mx-2 text-2xl font-black text-sky-300 sm:mx-3">→</span>
        {renderSide(q.eq.right, "R")}
      </div>
    );
  }

  function renderNumberPad(q, checkFn, checkEnabled) {
    const nums = [1, 2, 3, 4, 5, 6];
    return (
      <div className="mx-auto mt-5 w-full max-w-md">
        <div className="grid grid-cols-6 gap-2">
          {nums.map(function (n) {
            return (
              <button
                key={n}
                type="button"
                onClick={function () {
                  onTapNumber(n);
                }}
                className="h-14 rounded-2xl border border-white/10 bg-white/10 text-2xl font-black text-white transition hover:bg-white/15 active:scale-[0.97]"
              >
                {n}
              </button>
            );
          })}
        </div>
        <div className="mt-3">
          <ActionButton onClick={checkFn} disabled={!checkEnabled}>
            判定する
          </ActionButton>
        </div>
      </div>
    );
  }

  function renderCoeffRun(q) {
    return (
      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Chip>{q.eq.cat}</Chip>
          <div className="text-center text-sm font-bold text-white/70">
            {q.eq.desc}
          </div>
        </div>
        <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 px-4 py-8">
          {renderCoeffEquation(q)}
          {hintOn ? (
            <AtomHintPanel eq={q.eq} leftCoeffs={coeffL} rightCoeffs={coeffR} />
          ) : null}
        </div>
        <div className="mt-2 text-center text-[11px] font-bold text-white/45">
          マスをタップ → 数字をタップ（係数1のときは「1」を入力）
        </div>
        {renderNumberPad(q, onCheckCoeff, allCoeffFilled(q) && !overlay && !checkLock)}
      </div>
    );
  }

  /* ----- ○×ジャッジ画面 ----- */

  function renderJudgeRun(q) {
    return (
      <div className="mt-6">
        <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-10 text-center">
          <div className="text-xs font-bold text-white/55">
            この化学反応式、あってる？
          </div>
          <div className="mt-4">
            <EquationStatic
              eq={q.eq}
              leftCoeffs={q.shownLeft}
              rightCoeffs={q.shownRight}
              size="text-2xl sm:text-3xl"
            />
          </div>
        </div>
        <div className="mx-auto mt-5 grid w-full max-w-md grid-cols-2 gap-3">
          <button
            type="button"
            onClick={function () {
              onJudge(true);
            }}
            className="h-24 rounded-3xl border border-emerald-400/30 bg-emerald-500/15 text-5xl font-black text-emerald-200 transition hover:bg-emerald-500/25 active:scale-[0.98]"
          >
            ○
          </button>
          <button
            type="button"
            onClick={function () {
              onJudge(false);
            }}
            className="h-24 rounded-3xl border border-rose-400/30 bg-rose-500/15 text-5xl font-black text-rose-200 transition hover:bg-rose-500/25 active:scale-[0.98]"
          >
            ×
          </button>
        </div>
        <div className="mt-3 text-center text-[11px] font-bold text-white/45">
          つり合っていれば○・まちがいなら×（ミスすると＋3秒）
        </div>
      </div>
    );
  }

  /* ----- 組み立てラボ画面 ----- */

  function renderBuildEquation(q) {
    function renderSide(side, sideKey, subArr) {
      const nodes = [];
      for (let i = 0; i < side.length; i++) {
        if (i > 0) {
          nodes.push(
            <span key={sideKey + "p" + i} className="mx-1 text-xl font-black text-white/60">
              ＋
            </span>
          );
        }
        const selected = selPos.side === sideKey && selPos.idx === i;
        const value = sideKey === "L" ? coeffL[i] : coeffR[i];
        const sub = subArr[i];
        const isBad = !!badPos[posKey(sideKey, i)];
        nodes.push(
          <span key={sideKey + "t" + i} className="inline-flex items-center whitespace-nowrap py-1.5">
            <CoeffSlotButton
              value={isNil(value) ? null : value}
              selected={selected}
              onClick={function () {
                setSelPos({ side: sideKey, idx: i });
              }}
            />
            <button
              type="button"
              onClick={function () {
                setSelPos({ side: sideKey, idx: i });
                if (sub) {
                  // 配置済みの物質をタップで外す
                  setSubValue(sideKey, i, null);
                }
              }}
              className={
                "inline-flex h-12 min-w-[64px] items-center justify-center rounded-xl border-2 px-2 transition " +
                (isBad
                  ? "border-rose-400 bg-rose-500/20"
                  : selected
                    ? "border-sky-400 bg-sky-400/15"
                    : sub
                      ? "border-white/15 bg-white/10"
                      : "border-dashed border-white/30 bg-white/5")
              }
            >
              {sub ? (
                <FormulaText formula={sub} className="text-xl font-black" />
              ) : (
                <span className="text-sm font-black text-white/35">？</span>
              )}
            </button>
          </span>
        );
      }
      return nodes;
    }
    return (
      <div
        key={shakeKey}
        className={
          "flex flex-wrap items-center justify-center " +
          (shakeKey > 0 ? "animate-shake" : "")
        }
      >
        {renderSide(q.eq.left, "L", subL)}
        <span className="mx-2 text-2xl font-black text-sky-300">→</span>
        {renderSide(q.eq.right, "R", subR)}
      </div>
    );
  }

  function renderBuildRun(q) {
    const used = usedCardFormulas();
    const canCheck = allSubsFilled(q) && allCoeffFilled(q) && !overlay && !checkLock;
    return (
      <div className="mt-5">
        <div className="rounded-3xl border border-rose-400/20 bg-rose-500/10 px-4 py-4 text-center">
          <div className="text-[11px] font-bold text-rose-200/80">実験・操作</div>
          <div className="mt-1 text-base font-black leading-relaxed text-white sm:text-lg">
            {q.eq.desc}
          </div>
        </div>

        <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 px-3 py-6">
          {renderBuildEquation(q)}
          {hintOn ? (
            <AtomHintPanel
              eq={buildChosenEq(q)}
              leftCoeffs={coeffL}
              rightCoeffs={coeffR}
            />
          ) : null}
        </div>

        <div className="mt-2 text-center text-[11px] font-bold text-white/45">
          カードをタップして物質を入れ、数字で係数を入力しよう
        </div>

        <div className="mx-auto mt-3 grid w-full max-w-lg grid-cols-4 gap-2">
          {q.cards.map(function (f) {
            const isUsed = !!used[f];
            return (
              <button
                key={f}
                type="button"
                onClick={function () {
                  onTapCard(f);
                }}
                className={
                  "flex h-14 items-center justify-center rounded-2xl border px-1 transition active:scale-[0.97] " +
                  (isUsed
                    ? "border-dashed border-white/15 bg-white/5 text-white/30"
                    : "border-white/10 bg-white/10 text-white hover:bg-white/15")
                }
              >
                <FormulaText formula={f} className="text-lg font-black" />
              </button>
            );
          })}
        </div>

        {renderNumberPad(q, onCheckBuild, canCheck)}
      </div>
    );
  }

  /* ----- 実行画面 ----- */

  function renderRun() {
    if (!currentQ) return null;
    let body = null;
    if (currentQ.kind === "formula") body = renderFormulaRun(currentQ);
    if (currentQ.kind === "coeff") body = renderCoeffRun(currentQ);
    if (currentQ.kind === "judge") body = renderJudgeRun(currentQ);
    if (currentQ.kind === "build") body = renderBuildRun(currentQ);
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-4 sm:px-6">
        {renderHeader()}
        {renderProgressBar()}
        {body}
      </div>
    );
  }

  /* ----- カウントダウン ----- */

  function renderCountdown() {
    const labels = ["3", "2", "1", "スタート!"];
    return (
      <div className="flex min-h-[80vh] items-center justify-center">
        <div
          key={countdownStep}
          className="text-center text-7xl font-black tracking-tight text-white animate-countpop sm:text-8xl"
        >
          {labels[countdownStep]}
        </div>
      </div>
    );
  }

  /* ----- 結果画面 ----- */

  function renderResultQuestionRow(q, i) {
    if (q.kind === "formula") {
      return (
        <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
          <span className="text-sm font-bold text-white/80">{q.sub.name}</span>
          <FormulaText formula={q.sub.f} className="text-lg font-black" />
        </div>
      );
    }
    return (
      <div key={i} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
        <div className="text-[11px] font-bold text-white/50">{q.eq.desc}</div>
        <div className="mt-1 text-center">
          <EquationStatic eq={q.eq} size="text-base sm:text-lg" />
        </div>
      </div>
    );
  }

  function renderResult() {
    if (!lastResult) return null;
    const gr = gradeFor(lastResult.mode, lastResult.sec);
    const missed = lastResult.missedQuestions;
    const gradeColor =
      gr.grade === "SS"
        ? "text-amber-300 [text-shadow:0_0_18px_rgba(251,191,36,0.6)]"
        : gr.grade === "S"
          ? "text-emerald-300"
          : gr.grade === "A"
            ? "text-sky-300"
            : "text-white";
    return (
      <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-8 sm:px-6">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center">
          <div className="text-xs font-bold text-white/55">
            {MODE_CONFIG[lastResult.mode].title}
            {lastResult.phase === "review" ? "（復習）" : ""}
          </div>
          <div className="mt-4 text-6xl font-black tabular-nums text-white">
            {formatSeconds(lastResult.sec)}
            <span className="ml-1 text-2xl text-white/50">s</span>
          </div>
          {lastResult.phase === "main" ? (
            <div className={"mt-3 text-5xl font-black " + gradeColor}>{gr.grade}</div>
          ) : null}
          <div className="mt-3 text-lg font-black text-white">{gr.title}</div>
          <div className="mx-auto mt-1 max-w-sm text-sm text-white/65">
            {gr.comment}
          </div>
          {lastResult.isNewBest ? (
            <div className="mt-3 inline-flex items-center rounded-full border border-amber-300/40 bg-amber-400/15 px-3 py-1 text-xs font-black text-amber-200">
              ★ ベスト記録を更新！
            </div>
          ) : null}
          <div className="mt-4 text-xs font-bold text-white/50">
            まちがい：{wrongTaps} 回
          </div>
        </div>

        {missed.length > 0 ? (
          <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm font-black text-white">
              まちがえた問題（{missed.length}）
            </div>
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
              {missed.map(renderResultQuestionRow)}
            </div>
          </div>
        ) : null}

        <div className="mt-5 space-y-3">
          {missed.length > 0 ? (
            <ActionButton onClick={startReview}>
              復習する（まちがえた {missed.length} 問だけ）
            </ActionButton>
          ) : null}
          <ActionButton
            variant={missed.length > 0 ? "secondary" : "primary"}
            onClick={function () {
              startMode(lastResult.mode);
            }}
          >
            もう一度チャレンジ
          </ActionButton>
          <ActionButton variant="secondary" onClick={quitToHome}>
            ホームへ
          </ActionButton>
        </div>
      </div>
    );
  }

  /* ----- ホーム ----- */

  function bestCell(modeKey) {
    const rec = bestByMode[modeKey];
    const has = rec && typeof rec.sec === "number" && isFinite(rec.sec);
    const time = has ? formatSeconds(rec.sec) + "s" : "--.-s";
    const grade = has ? gradeFor(modeKey, rec.sec).grade : "-";
    const isSS = has && grade === "SS";
    return (
      <div key={modeKey} className="flex flex-col items-center justify-center px-1 py-3">
        <div className="whitespace-nowrap text-[10px] font-semibold text-white/60">
          {MODE_CONFIG[modeKey].shortLabel}
        </div>
        <div
          className={
            "mt-1 text-sm font-black tabular-nums " +
            (isSS
              ? "text-amber-300 [text-shadow:0_0_8px_rgba(251,191,36,0.55)]"
              : "text-white/90")
          }
        >
          {time}
        </div>
        <div
          className={
            "mt-0.5 text-lg font-black " +
            (isSS
              ? "text-amber-300 [text-shadow:0_0_10px_rgba(251,191,36,0.6)]"
              : "text-white")
          }
        >
          {grade}
        </div>
      </div>
    );
  }

  function renderHome() {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-8 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-bold tracking-widest text-sky-300/80">
              CHEMICAL EQUATION MASTER
            </div>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl">
              化学反応式マスター
            </h1>
            <div className="mt-2 text-sm font-bold text-white/60">
              中2理科「化学変化」 × タイムアタック
            </div>
          </div>
          <button
            type="button"
            onClick={function () {
              setShowHelp(true);
            }}
            className="shrink-0 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black text-white/80 hover:bg-white/10"
          >
            あそび方
          </button>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <ModeCard
            step="STEP1"
            accent="cyan"
            title="化学式マッチ"
            detail="物質名と化学式を対応づけよう（20問）。まずはここから！"
          >
            <StartButton
              onClick={function () {
                startMode(MODES.FORMULA_BASIC);
              }}
            >
              きほん
            </StartButton>
            <StartButton
              onClick={function () {
                startMode(MODES.FORMULA_CHALLENGE);
              }}
            >
              チャレンジ
            </StartButton>
          </ModeCard>

          <ModeCard
            step="STEP2"
            accent="violet"
            title="係数バランス"
            detail="反応式の係数を入力して、左右の原子の数をそろえよう（10問）"
          >
            <StartButton
              onClick={function () {
                startMode(MODES.COEFF_BASIC);
              }}
            >
              きほん
            </StartButton>
            <StartButton
              onClick={function () {
                startMode(MODES.COEFF_CHALLENGE);
              }}
            >
              チャレンジ
            </StartButton>
          </ModeCard>

          <ModeCard
            step="STEP3"
            accent="amber"
            title="○×ジャッジ"
            detail="この反応式、あってる？ 瞬時に見きわめよう（20問）"
          >
            <StartButton
              onClick={function () {
                startMode(MODES.JUDGE);
              }}
            >
              スタート
            </StartButton>
          </ModeCard>

          <ModeCard
            step="STEP4"
            accent="rose"
            title="組み立てラボ"
            detail="実験の説明から反応式をまるごと組み立てる、最終ステージ（5問）"
          >
            <StartButton
              onClick={function () {
                startMode(MODES.BUILD);
              }}
            >
              スタート
            </StartButton>
          </ModeCard>
        </div>

        <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-base font-black tracking-tight text-white">
                ベスト記録
              </div>
              <div className="mt-1 text-xs text-white/55">この端末に保存</div>
            </div>
            <div className="mt-1 shrink-0 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/80">
              BEST
            </div>
          </div>
          <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
            <div className="grid grid-cols-3 divide-x divide-white/10">
              {bestCell(MODES.FORMULA_BASIC)}
              {bestCell(MODES.FORMULA_CHALLENGE)}
              {bestCell(MODES.JUDGE)}
            </div>
            <div className="grid grid-cols-3 divide-x divide-white/10 border-t border-white/10">
              {bestCell(MODES.COEFF_BASIC)}
              {bestCell(MODES.COEFF_CHALLENGE)}
              {bestCell(MODES.BUILD)}
            </div>
          </div>
        </div>

        <div className="mt-6 text-center text-[11px] leading-relaxed text-white/35">
          係数は「最も簡単な整数比」で入力（1 も入力してね）
          <br />
          中学範囲の頻出化学反応式（イオン反応式を除く）を収録
        </div>
      </div>
    );
  }

  /* ----- 全体 ----- */

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-slate-950 text-white">
      {/* 背景の装飾 */}
      <div className="pointer-events-none fixed inset-0" aria-hidden="true">
        <div
          className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-sky-500/10"
          style={{ filter: "blur(70px)" }}
        />
        <div
          className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-violet-500/10"
          style={{ filter: "blur(70px)" }}
        />
      </div>

      <div className="relative">
        {screen === "home" ? renderHome() : null}
        {screen === "countdown" ? renderCountdown() : null}
        {screen === "run" ? renderRun() : null}
        {screen === "result" ? renderResult() : null}
      </div>

      {overlay ? (
        <Overlay kind={overlay.kind} title={overlay.title} sub={overlay.sub}>
          {overlay.node}
        </Overlay>
      ) : null}

      {toast ? (
        <div
          key={toast.key}
          className="fixed bottom-6 left-1/2 z-[55] w-[90%] max-w-md -translate-x-1/2 rounded-2xl border border-amber-300/40 bg-amber-500/90 px-4 py-3 text-center text-sm font-black text-slate-950 shadow-xl animate-popin"
        >
          {toast.text}
        </div>
      ) : null}

      {showHelp ? (
        <HelpModal
          onClose={function () {
            setShowHelp(false);
          }}
        />
      ) : null}
    </div>
  );
}
