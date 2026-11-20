param([string]$CodexHome = $env:CODEX_HOME, [string]$CodexBin, [string]$NodeBin)
$ErrorActionPreference = 'Stop'
if (-not $NodeBin) {
  $radarNodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if ($radarNodeCommand) { $NodeBin = $radarNodeCommand.Source }
  elseif (Test-Path -LiteralPath "$env:LOCALAPPDATA\hermes\node\node.exe") { $NodeBin = "$env:LOCALAPPDATA\hermes\node\node.exe" }
  else { throw '需要 Node.js 22 或更新版本。请通过 -NodeBin 指定 node.exe。' }
}
if (-not $CodexBin) {
  $radarPackage = Get-AppxPackage -Name OpenAI.Codex | Select-Object -First 1
  if ($radarPackage) { $CodexBin = Join-Path $radarPackage.InstallLocation 'app\resources\codex.exe' }
  else { throw '请通过 -CodexBin 指定 Codex 原生 CLI 的 codex.exe。' }
}
$radarInstallArgs = @((Join-Path $PSScriptRoot 'scripts\install.mjs'), '--codex-bin', $CodexBin)
if ($CodexHome) { $radarInstallArgs += @('--codex-home', $CodexHome) }
& $NodeBin @radarInstallArgs
if ($LASTEXITCODE -ne 0) { throw '模型雷达安装失败，保留现场供排查。' }
