$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceFont = Join-Path $projectRoot 'node_modules/react-native-vector-icons/Fonts/MaterialIcons.ttf'
$outputFont = Join-Path $projectRoot 'assets/fonts/MaterialIcons.web.ttf'

# Keep this list aligned with Icon usages in src/. The native apps continue using
# the full dependency font; this subset is only imported by index.web.js.
$icons = @(
  'close', 'explore', 'menu-book', 'person-outline', 'search', 'arrow-back',
  'bookmark-border', 'chevron-right', 'more-horiz', 'refresh', 'add-link', 'add',
  'auto-awesome', 'brightness-6', 'error-outline', 'swap-vert', 'bookmark',
  'cloud-download', 'delete-outline', 'public', 'list-alt', 'tune', 'dark-mode',
  'fullscreen', 'info-outline', 'stop', 'download', 'view-list', 'grid-view'
)

if (-not (Test-Path -LiteralPath $sourceFont)) {
  throw "Material Icons font not found. Run npm ci first."
}

$glyphMapPath = Join-Path $projectRoot 'node_modules/react-native-vector-icons/glyphmaps/MaterialIcons.json'
$glyphMap = Get-Content -LiteralPath $glyphMapPath -Raw | ConvertFrom-Json
$unicodeList = ($icons | ForEach-Object {
  $codepoint = $glyphMap.$_
  if ($null -eq $codepoint) { throw "Unknown Material Icon: $_" }
  'U+{0:X4}' -f [int]$codepoint
}) -join ','

python -c "import fontTools" 2>$null
if ($LASTEXITCODE -ne 0) {
  throw "FontTools is required. Install it with: python -m pip install fonttools[unicode]"
}

python -m fontTools.subset $sourceFont "--unicodes=$unicodeList" "--output-file=$outputFont"
