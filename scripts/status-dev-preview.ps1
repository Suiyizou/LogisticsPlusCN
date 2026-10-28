$ErrorActionPreference = 'Stop'
& node (Join-Path $PSScriptRoot 'dev-preview.mjs') status
exit $LASTEXITCODE
