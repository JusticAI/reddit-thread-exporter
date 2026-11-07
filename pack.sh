#!/bin/sh
# Builds the Chrome Web Store upload: dist/reddit-thread-exporter-<version>.zip (only the files the extension runs)
cd "$(dirname "$0")"
V=$(node -p "require('./manifest.json').version")
mkdir -p dist && rm -f dist/reddit-thread-exporter-$V.zip
zip -qr dist/reddit-thread-exporter-$V.zip manifest.json service-worker.js sidepanel.html sidepanel.css sidepanel.js src icons
echo "dist/reddit-thread-exporter-$V.zip"
