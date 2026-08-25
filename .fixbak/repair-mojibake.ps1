# Reverse UTF-8-as-GBK mojibake with whitelist validation.
# Usage: repair-mojibake.ps1 <infile> <outfile>
param(
  [Parameter(Mandatory=$true)][string]$InFile,
  [Parameter(Mandatory=$true)][string]$OutFile,
  [switch]$DryRun
)

$enc936 = [System.Text.Encoding]::GetEncoding(936, [System.Text.EncoderExceptionFallback]::new(), [System.Text.DecoderExceptionFallback]::new())
$utf8strict = New-Object System.Text.UTF8Encoding($false, $true)

# ---------- build whitelist of common Han chars from CLEAN repo files ----------
$corpusFiles = @()
$corpusFiles += Get-ChildItem 'docs','.' -Recurse -File -Filter '*.md' -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch 'node_modules|\.fixbak' }
$corpusFiles += Get-Item 'README.md','CODEX-P0-DATA-LOOP.md' -ErrorAction SilentlyContinue
$cleanSources = @(
  'src\composables\utils.ts','src\components\registry\widgetRegistry.ts',
  'src\modules\home\HomeView.vue','src\views\ActivityView.vue','src\components\ReviewPanel.vue',
  'src\composables\commandRegistry.ts','src\composables\useDataModel.ts',
  'src\composables\useProjectManager.ts','scripts\validate-page-designer.mjs'
)
foreach ($c in $cleanSources) { if (Test-Path $c) { $corpusFiles += Get-Item $c } }

$commonSet = New-Object 'System.Collections.Generic.HashSet[char]'
foreach ($f in $corpusFiles) {
  $t = Get-Content $f.FullName -Raw -Encoding UTF8
  foreach ($m in [regex]::Matches($t, '[\u4E00-\u9FFF]')) { [void]$commonSet.Add($m.Value[0]) }
}
Write-Output ("whitelist size: {0} chars from {1} corpus files" -f $commonSet.Count, $corpusFiles.Count)

function Test-Plausible([string]$s) {
  foreach ($ch in $s.ToCharArray()) {
    $c = [int]$ch
    if ($c -lt 0x80) { continue }                                  # ASCII passthrough
    if ($c -ge 0x4E00 -and $c -le 0x9FFF) { if (-not $commonSet.Contains($ch)) { return $false } ; continue }
    if (($c -ge 0x3000 -and $c -le 0x303F) -or ($c -ge 0xFF00 -and $c -le 0xFFEF)) { continue } # CJK punct / fullwidth
    return $false                                                  # anything else (Cyrillic etc.) => implausible
  }
  return $true
}

function TryReverse([string]$s) {
  # Lossless mode: only accept when the WHOLE window decodes cleanly back to UTF-8.
  # Partial/trimming decodes drop real characters sometimes -> left for the manual pass.
  try {
    $bytes = $enc936.GetBytes($s)
    if ($bytes.Length -lt 2) { return $null }
    $out = $utf8strict.GetString($bytes)
    if (($out -match '\uFFFD') -or $out.Length -eq 0) { return $null }
    if (-not (Test-Plausible $out)) { return $null }
    return @{ Text = $out; Consumed = $bytes.Length }
  } catch { return $null }
}

function Count-NonAscii([string]$s) { ([regex]::Matches($s, '[^\x00-\x7F]')).Count }

$lines = [System.IO.File]::ReadAllLines($InFile, [System.Text.UTF8Encoding]::new($false))
$outLines = New-Object System.Collections.Generic.List[string]
$changedCount = 0

for ($i = 0; $i -lt $lines.Count; $i++) {
  $line = $lines[$i]
  if ($line -notmatch '[^\x00-\x7F]') { $outLines.Add($line); continue }

  $work = $line
  for ($iter = 0; $iter -lt 15; $iter++) {
    $improved = $false
    $runs = [regex]::Matches($work, '[^\x00-\x7F]{2,}')
    foreach ($r in $runs) {
      $s = $r.Index; $e = $r.Index + $r.Length - 1
      $bestCand = $null
      for ($st = [Math]::Max(0, $s - 1); $st -le [Math]::Min($e - 1, $s + 1); $st++) {
        for ($en = $e + 3; $en -ge $st + 1; $en--) {
          if ($en -ge $work.Length) { continue }
          $w = $work.Substring($st, $en - $st + 1)
          $rw = TryReverse $w
          if ($null -eq $rw) { continue }
          $prefix = if ($st -gt 0) { $work.Substring(0, $st) } else { '' }
          $candidate = $prefix + $rw.Text + $work.Substring($en + 1)
          # accept only if strictly fewer weird chars and no loss of ascii structure
          if ((Count-NonAscii $candidate) -lt (Count-NonAscii $work)) { $bestCand = $candidate; break }
        }
        if ($bestCand) { break }
      }
      if ($bestCand) { $work = $bestCand; $improved = $true; break }
    }
    if (-not $improved) { break }
  }

  if ($work -ne $line) {
    $changedCount++
    Write-Output ("CHANGED L{0}:" -f ($i+1))
    Write-Output ("  OLD: {0}" -f $line)
    Write-Output ("  NEW: {0}" -f $work)
    $outLines.Add($work)
  } else {
    $outLines.Add($line)
  }
}

if (-not $DryRun) {
  $dir = Split-Path $OutFile -Parent
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
  [System.IO.File]::WriteAllLines($OutFile, $outLines, [System.Text.UTF8Encoding]::new($false))
}
Write-Output ("SUMMARY: {0}: changed {1}/{2} lines{3}" -f $InFile, $changedCount, $lines.Count, $(if ($DryRun) {' (dry-run)'} else {" -> $OutFile"}))
