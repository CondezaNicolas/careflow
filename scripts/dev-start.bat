@echo off
REM LIA Clinic - Quick Start Script for Windows
REM Usage: scripts\dev-start.bat

echo ======================================
echo 🚀 Starting LIA Clinic - All Services
echo ======================================
echo.

cd /d "%~dp0\.."

REM Check Docker is running
echo 📦 Checking Docker...
docker info >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker is not running. Please start Docker Desktop first.
    pause
    exit /b 1
)
echo ✅ Docker is running
echo.

REM Start Docker Compose services
echo 🐳 Starting Docker services...
docker-compose up -d

REM Wait for PostgreSQL
echo ⏳ Waiting for PostgreSQL...
:wait_pg
timeout /t 1 /nobreak >nul
docker exec lia-clinic-core-postgres-1 pg_isready -U lia >nul 2>&1
if errorlevel 1 (
    goto wait_pg
)
echo ✅ PostgreSQL is ready
echo.

REM Run migrations
echo 🔄 Running database migrations...
call npm run migration:check -w @lia/api
if errorlevel 1 (
    echo ❌ Migration failed
    pause
    exit /b 1
)
echo.

REM Start services
echo 🎉 All ready!
echo.
echo 📱 Frontend: http://localhost:3000
echo 🔧 Backend:  http://localhost:3001
echo.
echo Press Ctrl+C to stop all services
echo ======================================
echo.

REM Start all services
call npm run dev:all
