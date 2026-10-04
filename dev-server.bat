@echo off
chcp 65001 >nul
title Drop 서버 (이 창을 닫으면 서버가 꺼져요)
cd /d "%~dp0backend"
set DEV_LOCAL_MEDIA=1
npm start
pause
