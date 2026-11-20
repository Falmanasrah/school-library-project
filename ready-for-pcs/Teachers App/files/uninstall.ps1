# School Library Apps - removes the shortcuts this kit created for this Windows user.
param([string]$OutDir = '')
$ErrorActionPreference = 'Continue'
$apps = @(@{ Key = 'teachers'; Name = 'Library Booking' })
if ($OutDir) {
  $dataDir = Join-Path $OutDir 'AppData'
  $menuDir = Join-Path $OutDir 'StartMenu'
  $deskDir = Join-Path $OutDir 'Desktop'
} else {
  $dataDir = Join-Path $env:LOCALAPPDATA 'SchoolLibraryApps'
  $menuDir = Join-Path ([Environment]::GetFolderPath('Programs')) 'School Library'
  $deskDir = [Environment]::GetFolderPath('Desktop')
}
foreach ($app in $apps) {
  foreach ($dir in @($deskDir, $menuDir)) { foreach ($ext in @('.lnk', '.url')) { $p = Join-Path $dir ($app.Name + $ext); if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Force } } }
  $ico = Join-Path $dataDir ($app.Key + '.ico'); if (Test-Path -LiteralPath $ico) { Remove-Item -LiteralPath $ico -Force }
  Write-Host ('  Removed: ' + $app.Name)
}
foreach ($d in @($menuDir, $dataDir)) { if ((Test-Path -LiteralPath $d) -and -not (Get-ChildItem -LiteralPath $d -Force)) { Remove-Item -LiteralPath $d -Force } }
Write-Host '  Done. Other school library apps on this computer were left in place.'
Write-Host '  Apps installed from inside the browser are removed from the browser Apps page.'
