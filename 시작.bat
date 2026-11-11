@echo off
chcp 65001 >nul
cd /d "%~dp0"
title HR 캘린더 서버 (이 창을 닫으면 달력이 꺼집니다)

if not exist "public\index.html" (
  echo.
  echo  public\index.html 을 찾을 수 없습니다. 이 파일은 hr-calendar 폴더 안에 있어야 합니다.
  echo.
  pause
  exit /b 1
)

echo.
echo  이전에 켜 둔 달력 서버가 있으면 먼저 끕니다...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'python*' -and $_.CommandLine -like '*http.server 8765*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

echo  HR 캘린더 서버를 켭니다.
echo  잠시 후 브라우저가 자동으로 열립니다.
echo  이 검은 창은 닫지 말고 그대로 두세요. 다 쓰셨으면 그때 닫으면 됩니다.
echo.
start "" "http://localhost:8765/#/calendar"
python -m http.server 8765 --directory public
echo.
echo  서버가 끝났습니다. 브라우저에 달력이 안 보였다면 이 창의 내용을 캡처해서 보여 주세요.
pause
