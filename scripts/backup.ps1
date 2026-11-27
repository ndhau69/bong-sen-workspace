param(
  [string]$BackupRoot = "d:\Backup\bong-sen-workspace"
)

$ErrorActionPreference = "Stop"
$RepoDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$ZipPath = Join-Path $BackupRoot "bong-sen-workspace_$Timestamp.zip"
$StagingDir = Join-Path $env:TEMP "bs_backup_$Timestamp"

try {
  New-Item -ItemType Directory -Force -Path $StagingDir | Out-Null

  # Copy toàn bộ source (trừ node_modules, dist, .git)
  $ExcludeDirs = @("node_modules", "dist", ".git", ".netlify")
  Get-ChildItem -Path $RepoDir -Force | Where-Object {
    $ExcludeDirs -notcontains $_.Name
  } | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination (Join-Path $StagingDir $_.Name) -Recurse -Force
  }

  Compress-Archive -Path (Join-Path $StagingDir "*") -DestinationPath $ZipPath -Force

  # Giữ tối đa 20 bản backup gần nhất để không đầy ổ đĩa
  $OldBackups = Get-ChildItem -Path $BackupRoot -Filter "bong-sen-workspace_*.zip" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip 20
  if ($OldBackups) {
    $OldBackups | Remove-Item -Force
  }

  Write-Host "[Backup OK] Da luu ban sao source tai: $ZipPath"
} finally {
  if (Test-Path $StagingDir) {
    Remove-Item -Path $StagingDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}
