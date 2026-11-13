@echo off
setlocal
rem Usage: update.bat [zip_path] [commit message]
rem Run it from inside your repo folder.

set "ZIP=%~1"
if "%ZIP%"=="" set "ZIP=%USERPROFILE%\Downloads\scheduler.zip"
set "MSG=%~2"
if "%MSG%"=="" set "MSG=update app"

where git >nul 2>&1 || (
  echo Git is not installed or not in PATH. Install it: winget install Git.Git
  echo Then close and reopen this window.
  exit /b 1
)

if not exist ".git" (
  echo This folder is not a git repo yet. Run once:
  echo   git init -b main
  echo   git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
  exit /b 1
)

if not exist "%ZIP%" (
  echo Zip not found: %ZIP%
  exit /b 1
)

tar -xf "%ZIP%" -C . || (
  echo Extract failed
  exit /b 1
)

rem stale file from the first version
if exist www\app.js del www\app.js

git add -A
git diff --cached --quiet && (
  echo No changes to commit.
  exit /b 0
)

git commit -m "%MSG%" || exit /b 1
git push -u origin HEAD || exit /b 1
echo Pushed. Check the Actions tab for the build.
