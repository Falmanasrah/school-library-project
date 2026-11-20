@echo off
title School Library Apps - Install
cd /d "%~dp0"
echo.
echo  Install: school library apps for this Windows user.
echo  No administrator rights are needed.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0files\install.ps1"
if errorlevel 1 (
  echo.
  echo  The installer could not finish. Use the "Open ..." shortcuts in this folder instead.
)
echo.
pause
