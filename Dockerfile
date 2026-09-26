# syntax=docker/dockerfile:1

# ── 构建阶段：安装依赖并产出静态站点 ─────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ── verify 一次性服务：单测 + 生产构建 + 健康端点/核心样例冒烟 ──
FROM node:20-alpine AS verify
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ENV WEB_HEALTH_URL=http://web:80/healthz
CMD ["sh", "scripts/verify.sh"]

# ── 运行阶段：nginx 托管静态站点，/healthz 供 HTTP 健康检查 ──
FROM nginx:1.27-alpine AS runtime
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
