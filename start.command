#!/bin/bash
# Двойной клик в Finder: запускает локальный сервер и открывает прототип в браузере.
cd "$(dirname "$0")"
if ! command -v node >/dev/null; then
  echo 'Для полной версии нужен Node.js 20 или новее.'
  read -r
  exit 1
fi
node server.mjs 5173
