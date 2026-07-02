@echo off
REM One-shot dependency install for all three ShiftFlow projects (Windows).
REM Requires Node.js 22+ and (for the mobile app) the Flutter SDK on PATH.

echo === [1/3] Backend (shiftflow-mvp) ===
pushd shiftflow-mvp || exit /b 1
call npm install || (popd & exit /b 1)
popd

echo === [2/3] Web admin (web-admin) ===
pushd web-admin || exit /b 1
call npm install || (popd & exit /b 1)
popd

echo === [3/3] Mobile app (mobile) ===
where flutter >nul 2>nul
if %errorlevel%==0 (
  pushd mobile
  call flutter pub get
  popd
) else (
  echo Flutter not found on PATH - skipping mobile. Install from https://docs.flutter.dev
)

echo.
echo All dependencies installed.
echo Run the backend:   cd shiftflow-mvp ^&^& node src/server.js
echo Run the web admin: cd web-admin ^&^& npm run dev
