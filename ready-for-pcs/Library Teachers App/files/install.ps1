# School Library Apps - installer for one Windows user (no administrator rights needed).
# Creates Start menu and desktop shortcuts that open each app in its own window.
# Made by https://school-library-project-nu.vercel.app/download/ on 2026-11-20 (version 2.0.0).
# -OutDir puts everything in one folder instead (used for testing).
param([string]$OutDir = '')
$ErrorActionPreference = 'Stop'
$apps = @(
  @{ Key = 'library'; Name = 'Library Teachers'; Url = 'https://school-library-project-nu.vercel.app/library/'; Desc = 'Library Teachers App: visits, visitors log, approvals, permission slips and administration.' }
)
$kitDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ($OutDir) {
  $dataDir = Join-Path $OutDir 'AppData'
  $menuDir = Join-Path $OutDir 'StartMenu'
  $deskDir = Join-Path $OutDir 'Desktop'
} else {
  $dataDir = Join-Path $env:LOCALAPPDATA 'SchoolLibraryApps'
  $menuDir = Join-Path ([Environment]::GetFolderPath('Programs')) 'School Library'
  $deskDir = [Environment]::GetFolderPath('Desktop')
}

function Find-Browser {
  $pf86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
  $list = @()
  foreach ($base in @($pf86, $env:ProgramFiles, $env:LOCALAPPDATA)) { if ($base) { $list += (Join-Path $base 'Microsoft\Edge\Application\msedge.exe') } }
  foreach ($base in @($env:ProgramFiles, $pf86, $env:LOCALAPPDATA)) { if ($base) { $list += (Join-Path $base 'Google\Chrome\Application\chrome.exe') } }
  foreach ($p in $list) { if (Test-Path -LiteralPath $p) { return $p } }
  foreach ($exe in @('msedge.exe', 'chrome.exe')) {
    foreach ($root in @('HKCU:', 'HKLM:')) {
      $item = Get-ItemProperty -LiteralPath ($root + '\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\' + $exe) -ErrorAction SilentlyContinue
      if ($item) { $v = ([string]$item.'(default)').Trim('"'); if ($v -and (Test-Path -LiteralPath $v)) { return $v } }
    }
  }
  return $null
}

function Add-Shortcut([string]$dir, $app, [string]$icon) {
  if ($script:browser) {
    $lnk = $script:shell.CreateShortcut((Join-Path $dir ($app.Name + '.lnk')))
    $lnk.TargetPath = $script:browser
    $lnk.Arguments = '--app=' + $app.Url
    $lnk.WorkingDirectory = Split-Path -Parent $script:browser
    $lnk.Description = $app.Desc
    if ($icon) { $lnk.IconLocation = $icon + ',0' }
    $lnk.Save()
  } else {
    $lines = @('[InternetShortcut]', ('URL=' + $app.Url))
    if ($icon) { $lines += ('IconFile=' + $icon); $lines += 'IconIndex=0' }
    Set-Content -LiteralPath (Join-Path $dir ($app.Name + '.url')) -Value $lines -Encoding ASCII
  }
}

$script:browser = Find-Browser
$script:shell = New-Object -ComObject WScript.Shell
foreach ($d in @($dataDir, $menuDir, $deskDir)) { if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Force -Path $d | Out-Null } }
foreach ($app in $apps) {
  $icon = ''
  $src = Join-Path $kitDir ($app.Key + '.ico')
  if (Test-Path -LiteralPath $src) {
    $icon = Join-Path $dataDir ($app.Key + '.ico')
    Copy-Item -LiteralPath $src -Destination $icon -Force
  }
  Add-Shortcut $menuDir $app $icon
  Add-Shortcut $deskDir $app $icon
  Write-Host ('  Installed: ' + $app.Name + '  ->  ' + $app.Url)
}
Write-Host ""
if ($script:browser) { Write-Host ('  The apps open in their own window with ' + (Split-Path -Leaf $script:browser) + '.') }
else { Write-Host '  Microsoft Edge or Google Chrome was not found, so the shortcuts open in the default browser.' }
Write-Host '  Done. Look on the desktop and in the Start menu under "School Library".'
