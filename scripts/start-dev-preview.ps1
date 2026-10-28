param(
  [string]$SqlPath = 'C:/Users/ASUS/Desktop/cargo_planner.sql',
  [switch]$NoBuild
)
$ErrorActionPreference = 'Stop'
$previewScript = Join-Path $PSScriptRoot 'dev-preview.mjs'
$previewArgs = @($previewScript, 'start', "--sql=$SqlPath")
if ($NoBuild) { $previewArgs += '--no-build' }
& node @previewArgs
exit $LASTEXITCODE
