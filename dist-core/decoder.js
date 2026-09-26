import { DASH_UNITS, DOT_UNITS, INTRA_GAP_UNITS, LETTER_GAP_UNITS, MORSE_TABLE, WORD_GAP_UNITS, } from './morse.js';
/** 校验录入参数，返回问题列表（空数组表示合法）。 */
export function validateParams(p) {
    const issues = [];
    if (p.runs.length === 0) {
        issues.push('纸带为空：至少需要一段信号游程。');
    }
    if (p.runs.length > 0 && p.runs.length % 2 === 0) {
        issues.push(`游程共 ${p.runs.length} 段：纸带必须以信号游程开始并结束，段数应为奇数。`);
    }
    p.runs.forEach((d, i) => {
        if (!Number.isFinite(d) || d <= 0) {
            issues.push(`第 ${i + 1} 段时长必须为正数（当前：${Number.isNaN(d) ? '未填写' : d}）。`);
        }
    });
    if (!Number.isInteger(p.unitMin) ||
        !Number.isInteger(p.unitMax) ||
        p.unitMin < 1 ||
        p.unitMin > p.unitMax) {
        issues.push('单位时长范围必须为不小于 1 的整数，且下限不大于上限。');
    }
    if (p.alphabet.length === 0) {
        issues.push('受限字母表不能为空。');
    }
    for (const ch of p.alphabet) {
        if (!MORSE_TABLE[ch])
            issues.push(`字母表字符「${ch}」没有对应摩尔斯电码。`);
    }
    if (p.dictionary.length === 0) {
        issues.push('词典不能为空。');
    }
    for (const w of p.dictionary) {
        const bad = w.split('').find((ch) => !p.alphabet.includes(ch));
        if (bad)
            issues.push(`词典词「${w}」含有受限字母表之外的字符「${bad}」。`);
    }
    return issues;
}
/** 解释编码字符：同一位点只会出现同类游程，字典序即稳定取舍序。 */
const ENC = {
    dot: '.',
    dash: '-',
    intra: ':',
    letter: '|',
    word: '#',
};
const ROLE_UNITS = {
    dot: DOT_UNITS,
    dash: DASH_UNITS,
    intra: INTRA_GAP_UNITS,
    letter: LETTER_GAP_UNITS,
    word: WORD_GAP_UNITS,
};
function buildCtx(alphabet, dictionary) {
    const codePrefixes = new Set(['']);
    const letterOf = new Map();
    for (const ch of alphabet) {
        const code = MORSE_TABLE[ch];
        for (let i = 1; i <= code.length; i++)
            codePrefixes.add(code.slice(0, i));
        letterOf.set(code, ch);
    }
    const wordPrefixes = new Set(['']);
    const dictSet = new Set();
    for (const w of dictionary) {
        for (let i = 1; i <= w.length; i++)
            wordPrefixes.add(w.slice(0, i));
        dictSet.add(w);
    }
    return { codePrefixes, letterOf, wordPrefixes, dictSet };
}
const SEP = '\u0001';
const keyOf = (morse, word) => morse + SEP + word;
const splitKey = (k) => {
    const i = k.indexOf(SEP);
    return [k.slice(0, i), k.slice(i + 1)];
};
/** 三级择优：总绝对偏差 → 单段最大偏差 → 解释编码字典序。严格更优才返回 true。 */
function better(a, b) {
    if (a.cost !== b.cost)
        return a.cost < b.cost;
    if (a.maxDev !== b.maxDev)
        return a.maxDev < b.maxDev;
    return a.enc < b.enc;
}
/** 固定单位时长 u，在全部游程上联合搜索最优解释；无可行解释返回 null。 */
function solveForUnit(runs, u, ctx) {
    let cur = new Map([[keyOf('', ''), { cost: 0, maxDev: 0, enc: '' }]]);
    const parents = [];
    for (let i = 0; i < runs.length; i++) {
        const d = runs[i];
        const next = new Map();
        const par = new Map();
        const consider = (k, v, prevKey, role) => {
            const old = next.get(k);
            if (!old || better(v, old)) {
                next.set(k, v);
                par.set(k, { prev: prevKey, role });
            }
        };
        if (i % 2 === 0) {
            // 信号游程：点（1u）或划（3u）
            for (const [k, v] of cur) {
                const [morse, word] = splitKey(k);
                for (const sym of ['.', '-']) {
                    const nm = morse + sym;
                    if (!ctx.codePrefixes.has(nm))
                        continue;
                    const units = sym === '.' ? DOT_UNITS : DASH_UNITS;
                    const dev = Math.abs(d - units * u);
                    consider(keyOf(nm, word), { cost: v.cost + dev, maxDev: Math.max(v.maxDev, dev), enc: v.enc + ENC[sym === '.' ? 'dot' : 'dash'] }, k, sym === '.' ? 'dot' : 'dash');
                }
            }
        }
        else {
            // 空白游程：符内（1u）/ 符间（3u）/ 词间（7u）
            for (const [k, v] of cur) {
                const [morse, word] = splitKey(k);
                if (morse) {
                    const dev = Math.abs(d - INTRA_GAP_UNITS * u);
                    consider(k, { cost: v.cost + dev, maxDev: Math.max(v.maxDev, dev), enc: v.enc + ENC.intra }, k, 'intra');
                }
                const letter = ctx.letterOf.get(morse);
                if (letter !== undefined) {
                    const nw = word + letter;
                    if (ctx.wordPrefixes.has(nw)) {
                        const dev = Math.abs(d - LETTER_GAP_UNITS * u);
                        consider(keyOf('', nw), { cost: v.cost + dev, maxDev: Math.max(v.maxDev, dev), enc: v.enc + ENC.letter }, k, 'letter');
                    }
                    if (ctx.dictSet.has(nw)) {
                        const dev = Math.abs(d - WORD_GAP_UNITS * u);
                        consider(keyOf('', ''), { cost: v.cost + dev, maxDev: Math.max(v.maxDev, dev), enc: v.enc + ENC.word }, k, 'word');
                    }
                }
            }
        }
        if (next.size === 0)
            return null;
        cur = next;
        parents.push(par);
    }
    // 纸带结尾：最后一字母电码必须成字、最后一词必须入典。
    let bestKey = null;
    let bestVal = null;
    for (const [k, v] of cur) {
        const [morse, word] = splitKey(k);
        const letter = ctx.letterOf.get(morse);
        if (letter === undefined)
            continue;
        if (!ctx.dictSet.has(word + letter))
            continue;
        if (!bestVal || better(v, bestVal)) {
            bestKey = k;
            bestVal = v;
        }
    }
    if (bestKey === null || bestVal === null)
        return null;
    return { finalKey: bestKey, finalVal: bestVal, parents };
}
/** 由父指针回放解释序列，并正向重建每段解释、字母与词界。 */
function reconstruct(runs, u, sol, ctx) {
    const roles = [];
    let k = sol.finalKey;
    for (let i = sol.parents.length - 1; i >= 0; i--) {
        const p = sol.parents[i].get(k);
        if (!p)
            throw new Error('内部错误：父指针链断裂');
        roles.unshift(p.role);
        k = p.prev;
    }
    const runsOut = [];
    const letters = [];
    const words = [];
    let morse = '';
    let word = '';
    let cumulative = 0;
    const closeLetter = (wordIndex) => {
        const letter = ctx.letterOf.get(morse);
        if (letter === undefined)
            throw new Error(`内部错误：电码 ${morse} 无法成字`);
        letters.push({ letter, morse, wordIndex });
        word += letter;
        morse = '';
        return letter;
    };
    for (let i = 0; i < runs.length; i++) {
        const role = roles[i];
        const units = ROLE_UNITS[role];
        const ideal = units * u;
        const deviation = Math.abs(runs[i] - ideal);
        cumulative += deviation;
        const interp = {
            index: i,
            kind: i % 2 === 0 ? 'mark' : 'gap',
            role,
            duration: runs[i],
            units,
            ideal,
            deviation,
            cumulative,
        };
        if (role === 'dot')
            morse += '.';
        else if (role === 'dash')
            morse += '-';
        else if (role === 'letter')
            interp.letterAfter = closeLetter(words.length);
        else if (role === 'word') {
            interp.letterAfter = closeLetter(words.length);
            interp.wordAfter = word;
            words.push(word);
            word = '';
        }
        runsOut.push(interp);
    }
    closeLetter(words.length);
    words.push(word);
    return { runsOut, letters, words };
}
/**
 * 无解分析：正向可达性扫描（与单位时长无关，因为解释可行性不依赖 u），
 * 找出最早无法落入任何有效词典前缀的游程，并给出原因。
 */
function analyzeFailure(runs, ctx) {
    let cur = new Set([keyOf('', '')]);
    const MAX_REASONS = 8;
    for (let i = 0; i < runs.length; i++) {
        const next = new Set();
        const reasons = new Set();
        if (i % 2 === 0) {
            for (const k of cur) {
                const [morse, word] = splitKey(k);
                const canDot = ctx.codePrefixes.has(morse + '.');
                const canDash = ctx.codePrefixes.has(morse + '-');
                if (canDot)
                    next.add(keyOf(morse + '.', word));
                if (canDash)
                    next.add(keyOf(morse + '-', word));
                if (!canDot && !canDash) {
                    reasons.add(`第 ${i + 1} 段（信号）：已累积电码「${morse}」无论接续点或划，都不是受限字母表中任何字母电码的前缀。`);
                }
            }
        }
        else {
            for (const k of cur) {
                const [morse, word] = splitKey(k);
                if (morse)
                    next.add(k); // 符内停顿：继续累积当前字母
                const letter = ctx.letterOf.get(morse);
                if (letter === undefined) {
                    reasons.add(`第 ${i + 1} 段（空白）：此前累积电码「${morse}」不对应受限字母表中的任何字母。`);
                    continue;
                }
                const nw = word + letter;
                if (ctx.wordPrefixes.has(nw))
                    next.add(keyOf('', nw));
                else
                    reasons.add(`第 ${i + 1} 段（空白）：若作符间停顿，译出字母 ${letter} 后片段「${nw}」不是词典中任何词的前缀。`);
                if (ctx.dictSet.has(nw))
                    next.add(keyOf('', ''));
                else
                    reasons.add(`第 ${i + 1} 段（空白）：若作词间停顿，词「${nw}」不在词典中。`);
            }
        }
        if (next.size === 0)
            return { run: i, reasons: [...reasons].slice(0, MAX_REASONS) };
        cur = next;
    }
    const reasons = new Set();
    let feasible = false;
    for (const k of cur) {
        const [morse, word] = splitKey(k);
        const letter = ctx.letterOf.get(morse);
        if (letter === undefined) {
            reasons.add(`纸带结尾：电码「${morse}」不对应受限字母表中的任何字母。`);
            continue;
        }
        const w = word + letter;
        if (ctx.dictSet.has(w))
            feasible = true;
        else
            reasons.add(`纸带结尾：词「${w}」不在词典中。`);
    }
    if (feasible)
        return { run: runs.length - 1, reasons: ['内部状态异常：存在可行解释但未命中优化结果。'] };
    return { run: runs.length - 1, reasons: [...reasons].slice(0, MAX_REASONS) };
}
/**
 * 复原入口：在整个游程序列上共同选择整数单位时长与各游程解释。
 * 多个可行复原按 总绝对偏差 → 单段最大偏差 → 解释编码字典序（单位时长小者优先兜底）取舍。
 */
export function decode(params) {
    const issues = validateParams(params);
    if (issues.length > 0) {
        return { ok: false, reason: '录入参数无效，无法开始复原。', failureRun: -1, details: issues };
    }
    const ctx = buildCtx(params.alphabet, params.dictionary);
    let best = null;
    for (let u = params.unitMin; u <= params.unitMax; u++) {
        const sol = solveForUnit(params.runs, u, ctx);
        if (!sol)
            continue;
        if (!best || better(sol.finalVal, best.sol.finalVal)) {
            best = { u, sol };
        }
    }
    if (!best) {
        const failure = analyzeFailure(params.runs, ctx);
        const kind = failure.run % 2 === 0 ? '信号' : '空白';
        return {
            ok: false,
            reason: `无法复原：第 ${failure.run + 1} 段（${kind}游程，时长 ${params.runs[failure.run]}）起无法落入任何有效词典前缀。`,
            failureRun: failure.run,
            details: failure.reasons,
        };
    }
    const { runsOut, letters, words } = reconstruct(params.runs, best.u, best.sol, ctx);
    return {
        ok: true,
        unit: best.u,
        totalDeviation: best.sol.finalVal.cost,
        maxDeviation: best.sol.finalVal.maxDev,
        encoding: best.sol.finalVal.enc,
        message: words.join(' '),
        words,
        letters,
        runs: runsOut,
    };
}
