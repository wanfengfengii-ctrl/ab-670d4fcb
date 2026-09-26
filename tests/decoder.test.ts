import { describe, expect, it } from 'vitest';
import { decode, encodeTape, validateParams } from '../src/core/index.js';
import type { DecodeSuccess } from '../src/core/index.js';

/** 受潮的 SOS 纸带：理想单位时长 10，叠加了噪声。 */
const SOS_NOISY = [9, 11, 10, 10, 11, 29, 31, 10, 29, 11, 30, 31, 10, 9, 11, 10, 9];
const ALPHABET = ['E', 'H', 'L', 'O', 'P', 'S'];
const DICT = ['SOS', 'HELP', 'LOSS', 'POSE', 'SLOP'];

function expectOk(r: ReturnType<typeof decode>): DecodeSuccess {
  if (!r.ok) throw new Error(`预期成功却失败：${r.reason} ${r.details.join('；')}`);
  return r;
}

describe('录入校验', () => {
  it('拒绝偶数段游程（末段为空白）', () => {
    const r = decode({ runs: [10, 10], unitMin: 8, unitMax: 12, alphabet: ALPHABET, dictionary: DICT });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failureRun).toBe(-1);
      expect(r.details.join('')).toContain('奇数');
    }
  });

  it('拒绝非正时长、非法单位范围、空词典与字母表外字符', () => {
    expect(
      validateParams({ runs: [10, 0, 10], unitMin: 8, unitMax: 12, alphabet: ALPHABET, dictionary: DICT }).join(''),
    ).toContain('正数');
    expect(
      validateParams({ runs: [10], unitMin: 12, unitMax: 8, alphabet: ALPHABET, dictionary: DICT }).join(''),
    ).toContain('下限不大于上限');
    expect(
      validateParams({ runs: [10], unitMin: 8, unitMax: 12, alphabet: ALPHABET, dictionary: [] }).join(''),
    ).toContain('词典不能为空');
    expect(
      validateParams({ runs: [10], unitMin: 8, unitMax: 12, alphabet: ALPHABET, dictionary: ['SOS', 'MAYDAY'] }).join(''),
    ).toContain('受限字母表之外');
  });
});

describe('联合复原', () => {
  it('复原受潮 SOS 纸带：选中单位 10，总偏差与单段最大偏差正确', () => {
    const r = expectOk(
      decode({ runs: SOS_NOISY, unitMin: 8, unitMax: 14, alphabet: ALPHABET, dictionary: DICT }),
    );
    expect(r.message).toBe('SOS');
    expect(r.unit).toBe(10);
    expect(r.totalDeviation).toBe(11);
    expect(r.maxDeviation).toBe(1);
    expect(r.words).toEqual(['SOS']);
    expect(r.letters.map((l) => l.letter).join('')).toBe('SOS');
    // 累计偏差末值等于总偏差
    expect(r.runs[r.runs.length - 1].cumulative).toBe(r.totalDeviation);
    // 词内只有符间停顿，没有词界
    expect(r.runs.filter((x) => x.role === 'word')).toHaveLength(0);
    expect(r.runs.filter((x) => x.role === 'letter')).toHaveLength(2);
  });

  it('复原多词电文并标出词界', () => {
    const runs = encodeTape(['SOS', 'HELP'], 6);
    const r = expectOk(decode({ runs, unitMin: 4, unitMax: 8, alphabet: ALPHABET, dictionary: DICT }));
    expect(r.message).toBe('SOS HELP');
    expect(r.unit).toBe(6);
    expect(r.totalDeviation).toBe(0);
    const wordGaps = r.runs.filter((x) => x.role === 'word');
    expect(wordGaps).toHaveLength(1);
    expect(wordGaps[0].wordAfter).toBe('SOS');
    expect(wordGaps[0].ideal).toBe(42);
  });

  it('优先选择总绝对偏差更小的单位时长', () => {
    const runs = encodeTape(['SOS'], 10);
    const r = expectOk(decode({ runs, unitMin: 9, unitMax: 11, alphabet: ALPHABET, dictionary: DICT }));
    expect(r.unit).toBe(10);
    expect(r.totalDeviation).toBe(0);
  });

  it('总偏差与最大偏差并列时按解释编码稳定取舍', () => {
    // 单段信号时长 20、单位 10：点（偏差 10 → E）与划（偏差 10 → T）完全并列，
    // 编码 '-' 字典序先于 '.'，稳定选择划。
    const r = expectOk(
      decode({ runs: [20], unitMin: 10, unitMax: 10, alphabet: ['E', 'T'], dictionary: ['E', 'T'] }),
    );
    expect(r.message).toBe('T');
    expect(r.encoding).toBe('-');
    expect(r.totalDeviation).toBe(10);
  });

  it('受限字母表之外的字形不予译出', () => {
    const r = decode({
      runs: SOS_NOISY,
      unitMin: 8,
      unitMax: 14,
      alphabet: ['E', 'H', 'L', 'O', 'P'], // 去掉 S
      dictionary: ['HELP', 'POSE'],
    });
    expect(r.ok).toBe(false);
  });
});

describe('无解诊断', () => {
  it('报告最早无法落入任何有效词典前缀的游程', () => {
    // S + 符间 + 五个点：在 {O,S} 字母表下，前 14 段均可维持有效前缀
    // （如「S」「SO」），第 15 段（末段信号）后电码「..」「--」无法成字。
    const runs = [10, 10, 10, 10, 10, 30, 10, 10, 10, 10, 10, 10, 10, 10, 10];
    const r = decode({ runs, unitMin: 8, unitMax: 12, alphabet: ['O', 'S'], dictionary: ['SOS'] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failureRun).toBe(14);
      expect(r.reason).toContain('第 15 段');
      expect(r.details.join('')).toContain('不对应受限字母表中的任何字母');
    }
  });

  it('结尾词不在词典中时失败位置落在末段', () => {
    const runs = encodeTape(['O'], 10);
    const r = decode({ runs, unitMin: 8, unitMax: 12, alphabet: ['O', 'S'], dictionary: ['SOS'] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failureRun).toBe(runs.length - 1);
      expect(r.details.join('')).toContain('不在词典');
    }
  });
});
