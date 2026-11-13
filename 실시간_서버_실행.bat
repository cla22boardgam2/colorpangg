@echo off
chcp 65001 > nul
title 컬러팡 - 실시간 중계 서버
cd /d "%~dp0"
if not exist node_modules (
  echo 처음 실행이라 필요한 파일을 설치합니다... 잠시만 기다려 주세요.
  call npm install --omit=dev
)
node server.cjs
pause
