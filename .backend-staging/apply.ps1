$ErrorActionPreference = 'Stop'
$stageRoot = (Resolve-Path (Split-Path -Parent $MyInvocation.MyCommand.Path)).Path
$manifest = Get-Content -LiteralPath (Join-Path $stageRoot '.apply-manifest.json') -Raw | ConvertFrom-Json
$expectedRoot = [IO.Path]::GetFullPath('D:\Work\game\tu-tien-server\tutien_pixel_be').TrimEnd('\')
$actualRoot = (Resolve-Path $manifest.targetRoot).Path.TrimEnd('\')
if (-not [string]::Equals($actualRoot, $expectedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Backend target path did not match the reviewed destination.' }
$backupRoot = Join-Path $stageRoot '.rollback'
foreach ($item in $manifest.items) {
  $source = [IO.Path]::GetFullPath((Join-Path $stageRoot $item.path))
  $target = [IO.Path]::GetFullPath((Join-Path $actualRoot $item.path))
  if (-not $source.StartsWith($stageRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Staged source escaped its reviewed directory.' }
  if (-not $target.StartsWith($actualRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Backend destination escaped its reviewed directory.' }
  if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $item.afterHash) { throw "Staged file changed after review: $($item.path)" }
  if ($item.beforeHash) {
    if (-not (Test-Path -LiteralPath $target)) { throw "Backend file disappeared after review: $($item.path)" }
    if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $item.beforeHash) { throw "Backend file changed after review: $($item.path)" }
    $backup = Join-Path $backupRoot $item.path
    if (-not (Test-Path -LiteralPath $backup) -or (Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash -ne $item.beforeHash) { throw "Rollback copy is missing or invalid: $($item.path)" }
  } elseif (Test-Path -LiteralPath $target) { throw "New backend file appeared after review: $($item.path)" }
  $temporary = Join-Path (Split-Path -Parent $target) ('.' + [IO.Path]::GetFileName($target) + '.codex-tmp')
  if (Test-Path -LiteralPath $temporary) {
    if ((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash -ne $item.afterHash) { throw "Unexpected temporary file exists: $temporary" }
    Remove-Item -LiteralPath $temporary -Force
  }
  $replacementBackup = $temporary + '.old'
  if (Test-Path -LiteralPath $replacementBackup) { throw "Unexpected replacement backup exists: $replacementBackup" }
}
try {
  foreach ($item in $manifest.items) {
    $source = Join-Path $stageRoot $item.path
    $target = Join-Path $actualRoot $item.path
    $parent = Split-Path -Parent $target
    if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    $temporary = Join-Path $parent ('.' + [IO.Path]::GetFileName($target) + '.codex-tmp')
    $replacementBackup = $temporary + '.old'
    [IO.File]::WriteAllBytes($temporary, [IO.File]::ReadAllBytes($source))
    if ($item.beforeHash) {
      [IO.File]::Replace($temporary, $target, $replacementBackup)
      Remove-Item -LiteralPath $replacementBackup -Force
    }
    else { [IO.File]::Move($temporary, $target) }
  }
  foreach ($item in $manifest.items) {
    $target = Join-Path $actualRoot $item.path
    if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $item.afterHash) { throw "Post-write verification failed: $($item.path)" }
  }
} catch {
  $applyError = $_
  foreach ($item in $manifest.items) {
    $target = Join-Path $actualRoot $item.path
    $temporary = Join-Path (Split-Path -Parent $target) ('.' + [IO.Path]::GetFileName($target) + '.codex-tmp')
    $replacementBackup = $temporary + '.old'
    if (-not (Test-Path -LiteralPath $target)) {
      if (Test-Path -LiteralPath $temporary) {
        if ((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash -eq $item.afterHash) { Remove-Item -LiteralPath $temporary -Force }
      }
      if (Test-Path -LiteralPath $replacementBackup) {
        if ($item.beforeHash -and (Get-FileHash -LiteralPath $replacementBackup -Algorithm SHA256).Hash -eq $item.beforeHash) { Remove-Item -LiteralPath $replacementBackup -Force }
      }
      continue
    }
    $currentHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
    if ($currentHash -eq $item.afterHash -and $item.beforeHash) {
      $backup = Join-Path $backupRoot $item.path
      if (Test-Path -LiteralPath $backup) { Copy-Item -LiteralPath $backup -Destination $target -Force }
    } elseif ($currentHash -eq $item.afterHash -and -not $item.beforeHash) {
      Remove-Item -LiteralPath $target -Force
    } elseif ($item.beforeHash -and $currentHash -eq $item.beforeHash) {
      continue
    } else {
      Write-Warning "Rollback skipped because the backend file changed during the write: $($item.path)"
    }
    if (Test-Path -LiteralPath $temporary) {
      if ((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash -eq $item.afterHash) { Remove-Item -LiteralPath $temporary -Force }
    }
    if (Test-Path -LiteralPath $replacementBackup) {
      if ($item.beforeHash -and (Get-FileHash -LiteralPath $replacementBackup -Algorithm SHA256).Hash -eq $item.beforeHash) { Remove-Item -LiteralPath $replacementBackup -Force }
    }
  }
  throw $applyError
}
"Applied and hash-verified $($manifest.items.Count) backend files."
