# ASCII-only op runner. Reads UTF-8 ops JSON, applies to target file.
param(
  [Parameter(Mandatory=$true)][string]$OpsFile,
  [Parameter(Mandatory=$true)][string]$Target
)
$ErrorActionPreference = 'Stop'
$utf8 = [System.Text.UTF8Encoding]::new($false)
$json = [System.IO.File]::ReadAllText($OpsFile, $utf8) | ConvertFrom-Json
$lines = [System.IO.File]::ReadAllLines($Target, $utf8)
$ok = 0; $warn = 0

foreach ($op in $json) {
  if ($op.global) {
    for ($i = 0; $i -lt $lines.Count; $i++) {
      if ($lines[$i] -match [regex]::Escape($op.global)) {
        $new = [regex]::Replace($lines[$i], $op.find, $op.replace)
        if ($new -ne $lines[$i]) { $lines[$i] = $new; $ok++ }
      }
    }
    continue
  }
  $idx = [int]$op.line - 1
  if ($idx -lt 0 -or $idx -ge $lines.Count) { Write-Output ("WARN line out of range: " + $op.line); $warn++; continue }
  $l = $lines[$idx]
  $find = $op.find; $repl = $op.replace
  if ($op.after) {
    $k = $l.IndexOf($op.after)
    if ($k -lt 0) { Write-Output ("  WARN no-anchor L" + $op.line); $warn++; continue }
    $head = $l.Substring(0, $k); $tail = $l.Substring($k)
    $ntail = if ($op.literal) { $tail.Replace($find, $repl) } else { [regex]::Replace($tail, $find, $repl, 1) }
    if ($ntail -eq $tail) { Write-Output ("  WARN no-match L" + $op.line + " (after-scope)"); $warn++ } else { $ok++; Write-Output ("  ok L" + $op.line + " (scoped)") }
    $lines[$idx] = $head + $ntail
    continue
  }
  $new = if ($op.literal) { $l.Replace($find, $repl) } else { [regex]::Replace($l, $find, $repl, 1) }
  if ($new -eq $l) { Write-Output ("  WARN no-match L" + $op.line + ": " + $find.Substring(0, [Math]::Min(50, $find.Length))); $warn++ } else { $ok++; Write-Output ("  ok L" + $op.line) }
  $lines[$idx] = $new
}

[System.IO.File]::WriteAllLines($Target, $lines, $utf8)
Write-Output ("DONE applied=" + $ok + " warnings=" + $warn)
