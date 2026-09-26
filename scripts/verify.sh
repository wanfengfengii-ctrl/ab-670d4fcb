#!/bin/sh
# verify 一次性服务：汇总四类结论并以退出码报告。
# 退出码位含义：1=单元测试失败  2=生产构建失败  4=健康端点冒烟失败  8=复原核心样例冒烟失败
code=0
line="────────────────────────────────────────"

echo "$line"
echo "[1/4] 单元测试（vitest run）"
if npm run test; then
  echo "✔ 单元测试通过"
else
  echo "✘ 单元测试失败"
  code=$((code | 1))
fi

echo "$line"
echo "[2/4] 生产构建（tsc --noEmit && vite build）"
if npm run build; then
  echo "✔ 生产构建成功"
else
  echo "✘ 生产构建失败"
  code=$((code | 2))
fi

echo "$line"
HEALTH_URL="${WEB_HEALTH_URL:-http://web:80/healthz}"
echo "[3/4] 健康端点冒烟（GET $HEALTH_URL）"
ok=0
i=0
while [ "$i" -lt 30 ]; do
  body=$(wget -qO- "$HEALTH_URL" 2>/dev/null) && [ "$body" = "ok" ] && ok=1 && break
  i=$((i + 1))
  sleep 1
done
if [ "$ok" -eq 1 ]; then
  echo "✔ 健康端点返回 ok"
else
  echo "✘ 健康端点不可达或响应异常"
  code=$((code | 4))
fi

echo "$line"
echo "[4/4] 复原核心样例冒烟"
if npm run build:core && node scripts/smoke.mjs; then
  echo "✔ 复原核心样例冒烟通过"
else
  echo "✘ 复原核心样例冒烟失败"
  code=$((code | 8))
fi

echo "$line"
if [ "$code" -eq 0 ]; then
  echo "verify：全部结论通过（退出码 0）"
else
  echo "verify：存在失败项，退出码 $code（1=单测 2=构建 4=健康端点 8=核心样例）"
fi
exit "$code"
