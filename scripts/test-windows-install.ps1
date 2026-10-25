$ErrorActionPreference = 'Stop'
if ($env:CI -ne 'true') { throw 'This installation smoke test is intended for a disposable CI Windows account.' }
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$installer = (Resolve-Path "dist/Latitude-$version-Windows-x64-Setup.exe").Path
$installDir = Join-Path $env:RUNNER_TEMP 'Latitude-installed'
$desktopLink = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Latitude.lnk'
$startLink = Join-Path ([Environment]::GetFolderPath('Programs')) 'Latitude.lnk'
function Run-And-Wait($file, $arguments, $workingDirectory) {
  $process = Start-Process -FilePath $file -ArgumentList $arguments -WorkingDirectory $workingDirectory -PassThru
  if (-not $process.WaitForExit(90000)) { $process.Kill(); throw "Process timed out: $file" }
  if ($process.ExitCode -ne 0) { throw "Process failed ($($process.ExitCode)): $file" }
}
Run-And-Wait $installer @('/S', "/D=$installDir") $env:RUNNER_TEMP
$exe = Join-Path $installDir 'Latitude.exe'
foreach ($file in @($exe, $desktopLink, $startLink, (Join-Path $installDir 'resources/ffmpeg.exe'))) {
  if (-not (Test-Path $file)) { throw "Missing installed file or shortcut: $file" }
}
$ws = New-Object -ComObject WScript.Shell
foreach ($link in @($desktopLink, $startLink)) {
  $shortcut = $ws.CreateShortcut($link)
  if ($shortcut.TargetPath -ne $exe) { throw "Incorrect shortcut target: $link" }
}
# Deliberately launch from a folder unrelated to the installation.
Run-And-Wait $exe @('--smoke-test', '--disable-gpu') $env:RUNNER_TEMP
$profile = Join-Path $env:APPDATA 'Latitude'
New-Item -ItemType Directory -Path $profile -Force | Out-Null
$marker = Join-Path $profile 'installer-preservation-test.txt'
Set-Content $marker 'Preferences must survive updates and uninstall.'
# Exercise NSIS replacement in the existing install directory, including profile retention.
Run-And-Wait $installer @('/S') $env:RUNNER_TEMP
if (-not (Test-Path $marker)) { throw 'Installer replacement removed user preferences.' }
Run-And-Wait $exe @('--smoke-test', '--disable-gpu') $env:RUNNER_TEMP
$uninstaller = Join-Path $installDir 'Uninstall Latitude.exe'
Run-And-Wait $uninstaller @('/S', "_?=$installDir") $env:RUNNER_TEMP
if (Test-Path $exe) { throw 'Uninstaller left the application executable behind.' }
if ((Test-Path $desktopLink) -or (Test-Path $startLink)) { throw 'Uninstaller left application shortcuts behind.' }
if (-not (Test-Path $marker)) { throw 'Uninstaller removed user preferences.' }
Write-Output 'PASS: per-user install, desktop/Start shortcuts, packaged renderer + encoder launch from another folder, installer replacement and uninstall preserving data.'
