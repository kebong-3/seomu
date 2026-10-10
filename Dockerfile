FROM node:22-bookworm-slim AS ui
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-kor tesseract-ocr-eng poppler-utils && rm -rf /var/lib/apt/lists/*
RUN useradd -m -u 1000 seomu && mkdir -p /data /workspace && chown seomu:seomu /data /workspace
WORKDIR /workspace
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY --chown=seomu:seomu backend/app ./backend/app
COPY --chown=seomu:seomu sample-documents ./sample-documents
COPY --from=ui --chown=seomu:seomu /build/dist ./frontend/dist
USER seomu
ENV SEOMU_DATA_DIR=/data PYTHONUNBUFFERED=1
WORKDIR /workspace/backend
EXPOSE 7860
CMD ["sh","-c","exec python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-7860}"]
