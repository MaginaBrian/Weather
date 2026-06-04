#!/usr/bin/env bash
set -euo pipefail

echo "==> Installing Python dependencies"
pip install -r backend/requirements.txt

echo "==> Building frontend"
cd frontend
rm -rf dist
npm ci
npm run build
if [ ! -f dist/index.html ] || [ ! -d dist/assets ] || [ -z "$(ls -A dist/assets)" ]; then
  echo "ERROR: frontend build did not produce dist/index.html and dist/assets/*"
  exit 1
fi
echo "==> Frontend assets:"
ls -la dist/assets/
cd ..

echo "==> Build complete"
