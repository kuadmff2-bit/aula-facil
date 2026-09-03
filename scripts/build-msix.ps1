param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("x64", "arm64")]
  [string]$Architecture,

  [Parameter(Mandatory = $true)]
  [string]$TargetTriple,

  [Parameter(Mandatory = $true)]
  [string]$IdentityName,

  [Parameter(Mandatory = $true)]
  [string]$Publisher,

  [Parameter(Mandatory = $true)]
  [string]$PublisherDisplayName,

  [Parameter(Mandatory = $true)]
  [ValidatePattern("^\d+\.\d+\.\d+\.\d+$")]
  [string]$PackageVersion
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$manifestTemplate = Join-Path $projectRoot "src-tauri\msix\AppxManifest.xml"
$executable = Join-Path $projectRoot "src-tauri\target\$TargetTriple\release\aula-facil.exe"
$icons = Join-Path $projectRoot "src-tauri\icons"
$outputRoot = Join-Path $projectRoot "src-tauri\target\msix\$Architecture"
$layout = Join-Path $outputRoot "layout"
$assets = Join-Path $layout "Assets"
$packagePath = Join-Path $outputRoot "AulaFacil_$($PackageVersion)_$Architecture.msix"

if (-not (Test-Path $executable -PathType Leaf)) {
  throw "Executável não encontrado: $executable"
}

if (Test-Path $outputRoot) {
  Remove-Item $outputRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $assets -Force | Out-Null
Copy-Item $executable (Join-Path $layout "AulaFacil.exe")

$requiredAssets = @(
  "StoreLogo.png",
  "Square44x44Logo.png",
  "Square150x150Logo.png"
)

foreach ($asset in $requiredAssets) {
  $source = Join-Path $icons $asset
  if (-not (Test-Path $source -PathType Leaf)) {
    throw "Ícone obrigatório não encontrado: $source"
  }
  Copy-Item $source (Join-Path $assets $asset)
}

[xml]$manifest = Get-Content $manifestTemplate -Raw
$manifest.Package.Identity.SetAttribute("Name", $IdentityName)
$manifest.Package.Identity.SetAttribute("Version", $PackageVersion)
$manifest.Package.Identity.SetAttribute("Publisher", $Publisher)
$manifest.Package.Identity.SetAttribute("ProcessorArchitecture", $Architecture)
$manifest.Package.Properties.PublisherDisplayName = $PublisherDisplayName
$manifest.Save((Join-Path $layout "AppxManifest.xml"))

$windowsKits = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"
$makeAppx = Get-ChildItem $windowsKits -Filter "makeappx.exe" -Recurse |
  Where-Object { $_.FullName -match "\\x64\\makeappx\.exe$" } |
  Sort-Object FullName -Descending |
  Select-Object -First 1

if (-not $makeAppx) {
  throw "MakeAppx.exe não foi encontrado no Windows SDK."
}

& $makeAppx.FullName pack /d $layout /p $packagePath /o
if ($LASTEXITCODE -ne 0) {
  throw "MakeAppx.exe terminou com o código $LASTEXITCODE."
}

Write-Output $packagePath
