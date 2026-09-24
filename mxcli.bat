@echo off
set SCRIPT_DIR=%~dp0
set BIN_DIR=%SCRIPT_DIR%bin
if not exist "%BIN_DIR%\mxcli.exe" (
    echo [ERROR] mxcli binary not found in bin\. Please run "npm run update:mxcli".
    exit /b 1
)

:: If arguments already specify -p or --project, pass through directly
set "HAS_PROJECT=0"
for %%a in (%*) do (
    if "%%a"=="-p" set "HAS_PROJECT=1"
    if "%%a"=="--project" set "HAS_PROJECT=1"
)

if "%HAS_PROJECT%"=="1" (
    "%BIN_DIR%\mxcli.exe" %*
    exit /b %ERRORLEVEL%
)

if defined MENDIX_MPR_PATH (
    "%BIN_DIR%\mxcli.exe" -p "%MENDIX_MPR_PATH%" %*
    exit /b %ERRORLEVEL%
)

"%BIN_DIR%\mxcli.exe" %*
exit /b %ERRORLEVEL%
