$ErrorActionPreference = "Stop"
$projectDir = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectDir
& npm.cmd run local-ai:sync
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
