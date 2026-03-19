@echo off
REM ========================================
REM LIA Clinic - Full Docker Setup
REM ========================================
REM Usage: scripts\docker-start.bat
REM 
REM This script:
REM 1. Runs npm install (first time only)
REM 2. Builds all Docker images
REM 3. Starts PostgreSQL, Redis, MinIO
REM 4. Starts API, Web, Worker
REM 5. Runs migrations automatically
REM ========================================

echo.
echo ========================================
echo 🚀 LIA Clinic - Full Docker Start
echo ========================================
echo.

cd /d "%~dp0\.."

REM Check Docker
echo 📦 Checking Docker...
docker info >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker is not running. Please start Docker Desktop.
    pause
    exit /b 1
)
echo ✅ Docker is running
echo.

REM Check if node_modules exists, if not run npm install
if not exist "node_modules" (
    echo 📥 Running npm install...
    call npm install
    if errorlevel 1 (
        echo ❌ npm install failed
        pause
        exit /b 1
    )
    echo ✅ npm install complete
    echo.
) else (
    echo ✅ node_modules already exists
    echo.
)

REM Stop any existing containers from this project
echo 🧹 Cleaning up old containers...
docker compose -f docker-compose.full.yml down 2>nul
echo.

REM Build and start everything
echo 🔨 Building and starting all services...
echo.
echo 📦 Services:
echo    PostgreSQL:   localhost:5432
echo    Redis:        localhost:6379
echo    MinIO:        localhost:9000
echo    MinIO Console: localhost:9001
echo    Keycloak:     localhost:8080
echo    API:          localhost:3311
echo    Web:          localhost:3310
echo.

docker compose -f docker-compose.full.yml up --build

pause
