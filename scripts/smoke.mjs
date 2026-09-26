/**
 * 复原核心样例冒烟：直接运行在 tsc 编译出的 dist-core 上，
 * 覆盖 成功复原 / 多词词界 / 并列稳定取舍 / 无解定位 四类核心场景。
 * 任一断言失败即以非零码退出。
 */
import { decode, encodeTape } from '../dist-core/index.js';

let failures = 0;

function check(name, cond, extra = '') {
  if (cond) {
    console.log(`  ✔ ${name}`);
  } else {
    failures += 1;
    console.error(`  ✘ ${name} ${extra}`);
  }
}

const ALPHABET = ['E', 'H', 'L', 'O', 'P', 'S'];
const DICT = ['SOS', 'HELP', 'LOSS', 'POSE', 'SLOP'];

console.log('样例 1：受潮 SOS 纸带复原');
{
  const runs = [9, 11, 10, 10, 11, 29, 31, 10, 29, 11, 30, 31, 10, 9, 11, 10, 9];
  const r = decode({ runs, unitMin: 8, unitMax: 14, alphabet: ALPHABET, dictionary: DICT });
  check('译出 SOS', r.ok && r.message === 'SOS', JSON.stringify(r));
  check('单位时长为 10', r.ok && r.unit === 10);
  check('总绝对偏差为 11', r.ok && r.totalDeviation === 11);
  check('累计偏差末值等于总偏差', r.ok && r.runs[r.runs.length - 1].cumulative === r.totalDeviation);
}

console.log('样例 2：多词电文与词界');
{
  const runs = encodeTape(['SOS', 'HELP'], 6);
  const r = decode({ runs, unitMin: 4, unitMax: 8, alphabet: ALPHABET, dictionary: DICT });
  check('译出 SOS HELP', r.ok && r.message === 'SOS HELP');
  check('恰好一个词界且完结词为 SOS', r.ok && r.runs.filter((x) => x.role === 'word').length === 1 && r.runs.find((x) => x.role === 'word').wordAfter === 'SOS');
}

console.log('样例 3：偏差并列时按解释编码稳定取舍');
{
  const r = decode({ runs: [20], unitMin: 10, unitMax: 10, alphabet: ['E', 'T'], dictionary: ['E', 'T'] });
  check('稳定选择划（T）', r.ok && r.message === 'T' && r.encoding === '-');
}

console.log('样例 4：无解时定位最早失败游程');
{
  const runs = [10, 10, 10, 10, 10, 30, 10, 10, 10, 10, 10, 10, 10, 10, 10];
  const r = decode({ runs, unitMin: 8, unitMax: 12, alphabet: ['O', 'S'], dictionary: ['SOS'] });
  check('判定无解', !r.ok);
  check('失败游程下标为 14（末段）', !r.ok && r.failureRun === 14, `实际 ${r.failureRun}`);
  check('给出原因说明', !r.ok && r.details.length > 0);
}

if (failures > 0) {
  console.error(`复原核心样例冒烟：${failures} 项失败`);
  process.exit(1);
}
console.log('复原核心样例冒烟：全部通过');
