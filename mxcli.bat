@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0mxcli.ps1" %*
exit /b %errorlevel%
