# Reset seguro de base de datos LOCAL — Producto-Backend
# Solo permite localhost / 127.0.0.1 y NODE_ENV distinto de production.

$ErrorActionPreference = 'Stop'

function Write-Step($msg) {
  Write-Host "`n==> $msg" -ForegroundColor Cyan
}

function Load-DotEnv($path) {
  if (-not (Test-Path $path)) {
    throw "No se encontró .env en: $path"
  }
  Get-Content $path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    $idx = $line.IndexOf('=')
    if ($idx -lt 1) { return }
    $key = $line.Substring(0, $idx).Trim()
    $val = $line.Substring($idx + 1).Trim()
    if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
      $val = $val.Substring(1, $val.Length - 2)
    }
    Set-Item -Path "env:$key" -Value $val
  }
}

function Assert-SafeLocalReset {
  $nodeEnv = ($(if ($env:NODE_ENV) { $env:NODE_ENV } else { '' })).Trim().ToLowerInvariant()
  if ($nodeEnv -eq 'production') {
    throw 'ABORTADO: NODE_ENV=production. Este script solo puede ejecutarse en desarrollo local.'
  }

  $dbUrl = $env:DATABASE_URL
  if (-not $dbUrl) {
    throw 'ABORTADO: DATABASE_URL no está definida en .env'
  }

  if ($dbUrl -notmatch '(?i)(localhost|127\.0\.0\.1)') {
    throw "ABORTADO: DATABASE_URL no apunta a localhost. Valor actual: $dbUrl"
  }

  $displayEnv = if ($env:NODE_ENV) { $env:NODE_ENV } else { 'development' }
  Write-Host "OK — NODE_ENV=$displayEnv" -ForegroundColor Green
  Write-Host "OK — DATABASE_URL apunta a entorno local" -ForegroundColor Green
}

function Parse-PostgresUrl($url) {
  if ($url -match '^postgres(?:ql)?://([^:]+):([^@]+)@([^:/]+):(\d+)/(.+)$') {
    return @{
      User = $matches[1]
      Password = $matches[2]
      Host = $matches[3]
      Port = $matches[4]
      Database = $matches[5]
    }
  }
  throw "No se pudo parsear DATABASE_URL: $url"
}

function Get-PsqlPath {
  $cmd = Get-Command psql -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $candidates = @(
    'C:\Program Files\PostgreSQL\17\bin\psql.exe',
    'C:\Program Files\PostgreSQL\16\bin\psql.exe',
    'C:\Program Files\PostgreSQL\15\bin\psql.exe'
  )
  foreach ($p in $candidates) {
    if (Test-Path $p) { return $p }
  }
  throw 'psql no encontrado en PATH ni en rutas habituales de PostgreSQL.'
}

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Step 'Cargando .env y validando entorno'
Load-DotEnv (Join-Path $root '.env')
Assert-SafeLocalReset

$pg = Parse-PostgresUrl $env:DATABASE_URL
$psql = Get-PsqlPath

Write-Step 'Limpieza de esquema public (DROP SCHEMA CASCADE)'
$env:PGPASSWORD = $pg.Password
$sql = @'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO public;
GRANT ALL ON SCHEMA public TO postgres;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
'@

& $psql -h $pg.Host -p $pg.Port -U $pg.User -d $pg.Database -v ON_ERROR_STOP=1 -c $sql
if ($LASTEXITCODE -ne 0) { throw "psql falló con código $LASTEXITCODE" }

Write-Step 'Ejecutando migraciones'
npm run migration:run
if ($LASTEXITCODE -ne 0) { throw 'migration:run falló' }

Write-Step 'Ejecutando seed de usuarios'
npm run seed
if ($LASTEXITCODE -ne 0) { throw 'seed falló' }

Write-Step 'Resumen post-reset'
$summarySql = @"
SELECT 'users' AS tabla, COUNT(*)::text AS registros FROM users
UNION ALL SELECT 'projects', COUNT(*)::text FROM projects
UNION ALL SELECT 'audit_logs', COUNT(*)::text FROM audit_logs
UNION ALL SELECT 'notifications', COUNT(*)::text FROM notifications
UNION ALL SELECT 'typeorm_migrations', COUNT(*)::text FROM typeorm_migrations;
"@
& $psql -h $pg.Host -p $pg.Port -U $pg.User -d $pg.Database -c $summarySql

Write-Host "`nReset local completado correctamente." -ForegroundColor Green
Write-Host "Siguiente paso: npm run start:dev" -ForegroundColor Yellow
