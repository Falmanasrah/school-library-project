@echo off
title School Library Apps - Uninstall
cd /d "%~dp0"
echo.
echo  Uninstall: school library apps for this Windows user.
echo  No administrator rights are needed.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0files\uninstall.ps1"
if errorlevel 1 (
  echo.
  echo  Some shortcuts could not be removed. Delete them from the desktop by hand.
)
echo.
pause
