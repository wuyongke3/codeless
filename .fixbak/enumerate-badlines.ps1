# Enumerate lines still needing manual mojibake fixes.
param([Parameter(Mandatory=$true)][string]$InFile)
$enc936 = [System.Text.Encoding]::GetEncoding(936, [System.Text.EncoderExceptionFallback]::new(), [System.Text.DecoderExceptionFallback]::new())
$utf8strict = New-Object System.Text.UTF8Encoding($false, $true)

$corpusFiles = @()
$corpusFiles += Get-ChildItem 'docs','.' -Recurse -File -Filter '*.md' -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch 'node_modules|\.fixbak' }
foreach ($c in @('src\composables\utils.ts','src\components\registry\widgetRegistry.ts','src\modules\home\HomeView.vue','src\views\ActivityView.vue','src\components\ReviewPanel.vue','src\composables\commandRegistry.ts')) { if (Test-Path $c) { $corpusFiles += Get-Item $c } }
$commonSet = New-Object 'System.Collections.Generic.HashSet[char]'
foreach ($f in $corpusFiles) { $t = Get-Content $f.FullName -Raw -Encoding UTF8; foreach ($m in [regex]::Matches($t, '[\u4E00-\u9FFF]')) { [void]$commonSet.Add($m.Value[0]) } }

function Has-ReversibleRun([string]$s) {
  foreach ($r in [regex]::Matches($s, '[^\x00-\x7F]{2,}')) {
    try { $out = $utf8strict.GetString($enc936.GetBytes($r.Value)); if (($out -notmatch '\uFFFD') -and ($out -ne $r.Value)) { return $true } } catch { }
  }
  return $false
}
function Has-RareChar([string]$s) {
  foreach ($ch in $s.ToCharArray()) {
    $c = [int]$ch
    if (($c -ge 0x4E00 -and $c -le 0x9FFF) -and -not $commonSet.Contains($ch)) { return $true }
    if (($c -ge 0x0400 -and $c -le 0x04FF) -or ($c -ge 0x0370 -and $c -le 0x03FF)) { return $true }
  }
  return $false
}

$lines = [System.IO.File]::ReadAllLines($InFile, [System.Text.UTF8Encoding]::new($false))
for ($i = 0; $i -lt $lines.Count; $i++) {
  $l = $lines[$i]
  if ($l -notmatch '[^\x00-\x7F]') { continue }
  $fffd = $l -match '\uFFFD'
  $rev = Has-ReversibleRun $l
  $rare = Has-RareChar $l
  if ($fffd -or $rev -or $rare) {
    $tag = $(if ($fffd) { 'F' } else { '-' }) + $(if ($rev) { 'R' } else { '-' }) + $(if ($rare) { 'Q' } else { '-' })
    Write-Output ("L{0} [{1}] {2}" -f ($i+1), $tag, $l)
  }
}