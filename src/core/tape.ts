import {
  DASH_UNITS,
  DOT_UNITS,
  INTRA_GAP_UNITS,
  LETTER_GAP_UNITS,
  MORSE_TABLE,
  WORD_GAP_UNITS,
} from './morse.js';

/**
 * 由词典词序列与单位时长生成一条理想纸带的游程时长序列
 * （信号游程开始并结束，信号/空白交替）。用于示例、测试与冒烟。
 */
export function encodeTape(words: string[], unit: number): number[] {
  if (!Number.isInteger(unit) || unit < 1) {
    throw new Error(`单位时长必须为正整数，收到 ${unit}`);
  }
  if (words.length === 0) {
    throw new Error('至少需要一个词才能生成纸带');
  }
  const runs: number[] = [];
  words.forEach((word, wi) => {
    if (wi > 0) runs.push(WORD_GAP_UNITS * unit);
    const letters = word.toUpperCase().split('');
    letters.forEach((letter, li) => {
      if (li > 0) runs.push(LETTER_GAP_UNITS * unit);
      const code = MORSE_TABLE[letter];
      if (!code) throw new Error(`字符 ${letter} 没有对应摩尔斯电码`);
      code.split('').forEach((sym, si) => {
        if (si > 0) runs.push(INTRA_GAP_UNITS * unit);
        runs.push((sym === '.' ? DOT_UNITS : DASH_UNITS) * unit);
      });
    });
  });
  return runs;
}
