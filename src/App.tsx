import { useState } from 'react';
import { decode } from './core/index.js';
import type { DecodeResult, DecodeSuccess, Role, RunInterpretation } from './core/index.js';

interface Draft {
  runs: number[];
  unitMin: number;
  unitMax: number;
  alphabet: string;
  dictText: string;
}

/** 默认示例：一条受潮的 SOS 纸带（单位时长 10，带噪声）。 */
const SAMPLE: Draft = {
  runs: [9, 11, 10, 10, 11, 29, 31, 10, 29, 11, 30, 31, 10, 9, 11, 10, 9],
  unitMin: 8,
  unitMax: 14,
  alphabet: 'ELOPSH',
  dictText: 'SOS\nHELP\nLOSS\nPOSE\nSLOP',
};

const ROLE_LABEL: Record<Role, string> = {
  dot: '点 ·（1u）',
  dash: '划 −（3u）',
  intra: '符内停顿（1u）',
  letter: '符间停顿（3u）',
  word: '词间停顿（7u）',
};

function parseAlphabet(text: string): string[] {
  return Array.from(new Set(text.toUpperCase().replace(/[^A-Z0-9]/g, '').split('')));
}

function parseDictionary(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/[\s,，、;；]+/)
        .map((w) => w.trim().toUpperCase())
        .filter(Boolean),
    ),
  );
}

export default function App() {
  const [draft, setDraft] = useState<Draft>(SAMPLE);
  /** 结果与其对应的游程快照：草稿改动后旧电文立即失效，但仍按原样展示。 */
  const [result, setResult] = useState<{ r: DecodeResult; runs: number[] } | null>(null);
  const [stale, setStale] = useState(false);

  /** 草稿任一改动立即使旧电文失效。 */
  const mutate = (fn: (d: Draft) => Draft) => {
    setDraft((d) => fn(d));
    if (result) setStale(true);
  };

  const setRun = (i: number, value: number) =>
    mutate((d) => ({ ...d, runs: d.runs.map((r, j) => (j === i ? value : r)) }));
  const removeRun = (i: number) =>
    mutate((d) => ({ ...d, runs: d.runs.filter((_, j) => j !== i) }));
  const appendRun = () => mutate((d) => ({ ...d, runs: [...d.runs, 10] }));
  const appendPair = () => mutate((d) => ({ ...d, runs: [...d.runs, 10, 10] }));
  const clearRuns = () => mutate((d) => ({ ...d, runs: [] }));
  const loadSample = () => mutate(() => SAMPLE);

  const runDecode = () => {
    setResult({
      r: decode({
        runs: draft.runs,
        unitMin: draft.unitMin,
        unitMax: draft.unitMax,
        alphabet: parseAlphabet(draft.alphabet),
        dictionary: parseDictionary(draft.dictText),
      }),
      runs: [...draft.runs],
    });
    setStale(false);
  };

  const parityIssue = draft.runs.length > 0 && draft.runs.length % 2 === 0;

  return (
    <div className="page">
      <header className="masthead">
        <h1>极地救援站 · 呼救电文复原</h1>
        <p>
          录入受潮纸带上按出现顺序的明暗游程与允许的单单位时长范围，在整个序列上共同选择整数单位时长与各游程解释，
          复原受限字母表与词典约束下的呼救电文。
        </p>
      </header>

      <section className="panel">
        <div className="panel-head">
          <h2>① 纸带游程</h2>
          <div className="actions">
            <button onClick={appendRun}>追加一段</button>
            <button onClick={appendPair} title="追加一段空白 + 一段信号，保持以信号结尾">
              追加空白+信号
            </button>
            <button onClick={clearRuns}>清空</button>
            <button onClick={loadSample}>载入示例</button>
          </div>
        </div>
        <p className="hint">
          奇数段（第 1、3、5…段）为信号游程，偶数段为空白游程；纸带必须以信号游程开始并结束。
          {parityIssue && (
            <strong className="warn"> 当前共 {draft.runs.length} 段（偶数），末段为空白，不合法。</strong>
          )}
        </p>
        {draft.runs.length === 0 ? (
          <p className="empty">尚未录入游程。</p>
        ) : (
          <div className="runs-grid">
            {draft.runs.map((d, i) => (
              <div className={`run-cell ${i % 2 === 0 ? 'mark' : 'gap'}`} key={i}>
                <span className="run-idx">
                  #{i + 1} {i % 2 === 0 ? '信号' : '空白'}
                </span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={Number.isNaN(d) ? '' : d}
                  onChange={(e) => setRun(i, e.target.valueAsNumber)}
                />
                <button className="del" title="删除该段" onClick={() => removeRun(i)}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h2>② 约束条件</h2>
        <div className="constraints">
          <label>
            单位时长下限
            <input
              type="number"
              min="1"
              step="1"
              value={Number.isNaN(draft.unitMin) ? '' : draft.unitMin}
              onChange={(e) => mutate((d) => ({ ...d, unitMin: e.target.valueAsNumber }))}
            />
          </label>
          <label>
            单位时长上限
            <input
              type="number"
              min="1"
              step="1"
              value={Number.isNaN(draft.unitMax) ? '' : draft.unitMax}
              onChange={(e) => mutate((d) => ({ ...d, unitMax: e.target.valueAsNumber }))}
            />
          </label>
          <label>
            受限字母表
            <input
              type="text"
              value={draft.alphabet}
              placeholder="如 ELOPSH"
              onChange={(e) => mutate((d) => ({ ...d, alphabet: e.target.value }))}
            />
          </label>
          <label className="dict">
            词典（空白/逗号分隔）
            <textarea
              rows={4}
              value={draft.dictText}
              onChange={(e) => mutate((d) => ({ ...d, dictText: e.target.value }))}
            />
          </label>
        </div>
        <div className="decode-row">
          <button className="primary" onClick={runDecode}>
            复原电文
          </button>
          {stale && <span className="stale-badge">草稿已修改 —— 旧电文已失效，请重新复原</span>}
        </div>
      </section>

      {result && (
        <div className={stale ? 'result-wrap stale' : 'result-wrap'}>
          {stale && <div className="stale-overlay">已失效</div>}
          {result.r.ok ? <SuccessView r={result.r} /> : <FailureView r={result.r} runs={result.runs} />}
        </div>
      )}

      <footer className="foot">
        择优规则：总绝对时长偏差最小 → 单段最大偏差最小 → 按游程顺序的解释编码（. - : | #）字典序。
      </footer>
    </div>
  );
}

function SuccessView({ r }: { r: DecodeSuccess }) {
  return (
    <section className="panel result ok">
      <h2>复原电文</h2>
      <div className="message">
        {r.words.map((w, i) => (
          <span className="word-chip" key={i} title={`第 ${i + 1} 词`}>
            {w}
          </span>
        ))}
      </div>
      <div className="letters-line">
        {r.letters.map((l, i) => (
          <span className="letter-morse" key={i}>
            {l.letter}
            <small>{l.morse.replace(/\./g, '·').replace(/-/g, '−')}</small>
          </span>
        ))}
      </div>
      <dl className="stats">
        <div>
          <dt>单位时长 u</dt>
          <dd>{r.unit}</dd>
        </div>
        <div>
          <dt>总绝对偏差</dt>
          <dd>{r.totalDeviation}</dd>
        </div>
        <div>
          <dt>单段最大偏差</dt>
          <dd>{r.maxDeviation}</dd>
        </div>
        <div>
          <dt>解释编码</dt>
          <dd className="mono">{r.encoding}</dd>
        </div>
      </dl>
      <h3>逐段解释</h3>
      <RunsTable runs={r.runs} />
    </section>
  );
}

function RunsTable({ runs }: { runs: RunInterpretation[] }) {
  return (
    <table className="runs-table">
      <thead>
        <tr>
          <th>段</th>
          <th>类型</th>
          <th>录入时长</th>
          <th>解释</th>
          <th>理想时长</th>
          <th>偏差</th>
          <th>累计偏差</th>
          <th>边界</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => (
          <tr key={r.index} className={r.role === 'word' ? 'word-boundary' : r.role === 'letter' ? 'letter-boundary' : ''}>
            <td>#{r.index + 1}</td>
            <td>{r.kind === 'mark' ? '信号' : '空白'}</td>
            <td>{r.duration}</td>
            <td>{ROLE_LABEL[r.role]}</td>
            <td>{r.ideal}</td>
            <td>{r.deviation}</td>
            <td>{r.cumulative}</td>
            <td>
              {r.wordAfter ? `词界 ‖「${r.wordAfter}」完结` : r.letterAfter ? `字母 ▏${r.letterAfter}` : ''}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FailureView({ r, runs }: { r: Extract<DecodeResult, { ok: false }>; runs: number[] }) {
  return (
    <section className="panel result fail">
      <h2>无法复原</h2>
      <p className="fail-reason">{r.reason}</p>
      <ul className="fail-details">
        {r.details.map((d, i) => (
          <li key={i}>{d}</li>
        ))}
      </ul>
      {r.failureRun >= 0 && (
        <>
          <h3>未能译码的位置</h3>
          <table className="runs-table">
            <thead>
              <tr>
                <th>段</th>
                <th>类型</th>
                <th>录入时长</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((d, i) => (
                <tr
                  key={i}
                  className={i === r.failureRun ? 'fail-row' : i > r.failureRun ? 'after-fail' : ''}
                >
                  <td>#{i + 1}</td>
                  <td>{i % 2 === 0 ? '信号' : '空白'}</td>
                  <td>{d}</td>
                  <td>{i === r.failureRun ? '✘ 未能译码' : i > r.failureRun ? '未参与译码' : '可落入有效前缀'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
