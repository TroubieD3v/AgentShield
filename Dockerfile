# syntax=docker/dockerfile:1
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.13-slim AS app
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 AGENTSHIELD_HOME=/data AGENTSHIELD_UI_DIR=/app/ui AGENTSHIELD_ALLOW_BIND_ALL=1
WORKDIR /app
COPY pyproject.toml README.md LICENSE ./
COPY src ./src
RUN pip install ".[postgres]"
COPY --from=web /web/dist /app/ui
RUN useradd --system --uid 10001 agentshield && mkdir -p /data && chown agentshield /data
USER agentshield
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/api/health', timeout=2).status == 200 else 1)"
CMD ["agentshield", "serve", "--host", "0.0.0.0", "--port", "8080"]
