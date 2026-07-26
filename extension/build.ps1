# Assembles loadable extension folders for each browser under build/.
# A browser needs its manifest named exactly "manifest.json", so we copy the
# shared files plus the right manifest into build/chromium and build/firefox.
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$shared = @(
  "inject.js", "content.js", "background.js",
  "options.html", "options.js", "popup.html", "popup.js"
)
$targets = @(
  @{ name = "chromium"; manifest = "manifest.chromium.json" },
  @{ name = "firefox";  manifest = "manifest.firefox.json" }
)
foreach ($t in $targets) {
  $out = Join-Path $root "build/$($t.name)"
  if (Test-Path $out) { Remove-Item $out -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $out | Out-Null
  foreach ($f in $shared) { Copy-Item (Join-Path $root $f) (Join-Path $out $f) }
  Copy-Item (Join-Path $root $t.manifest) (Join-Path $out "manifest.json")
  Write-Host "Built $out"
}
Write-Host "Done. Load build/chromium or build/firefox as an unpacked extension."
