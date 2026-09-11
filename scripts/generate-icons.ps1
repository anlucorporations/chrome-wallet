# =============================================================================
#  generate-icons.ps1 - Genera los iconos de la extension TrueKeate Wallet
#  a partir de TrueKeate/TrueKeate_logo.png
#
#  Uso:  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\generate-icons.ps1
#
#  Salida: public/icons/icon-{16,32,48,128}.png  y  public/brand/truekeate-mark-96.png
#
#  Notas:
#   - Requiere .NET System.Drawing (Windows PowerShell 5.1).
#   - Los PNG resultantes se versionan: no hace falta regenerar en cada build.
#   - 16/32 px usan una variante simplificada (zoom al 60% central + saturacion)
#     porque el isologo completo se emborrona por debajo de 48 px.
# =============================================================================
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

$root  = Split-Path -Parent $PSScriptRoot
$srcPng = Join-Path $root 'TrueKeate\TrueKeate_logo.png'
$outIcons = Join-Path $root 'public\icons'
$outBrand = Join-Path $root 'public\brand'

if (-not (Test-Path $srcPng)) { throw "No se encontro el activo original: $srcPng" }
New-Item -ItemType Directory -Force -Path $outIcons | Out-Null
New-Item -ItemType Directory -Force -Path $outBrand | Out-Null

$src = New-Object System.Drawing.Bitmap($srcPng)

function Test-Ink($c) {
    if ($c.A -lt 200) { return $false }
    if ($c.R -gt 238 -and $c.G -gt 238 -and $c.B -gt 238) { return $false }
    return $true
}

# --- 1. Detectar el rectangulo del contenido (ignora el fondo blanco) -------
$minX = $src.Width; $minY = $src.Height; $maxX = 0; $maxY = 0
for ($x = 0; $x -lt $src.Width; $x += 2) {
    for ($y = 0; $y -lt $src.Height; $y += 2) {
        if (-not (Test-Ink $src.GetPixel($x, $y))) { continue }
        if ($x -lt $minX) { $minX = $x }; if ($x -gt $maxX) { $maxX = $x }
        if ($y -lt $minY) { $minY = $y }; if ($y -gt $maxY) { $maxY = $y }
    }
}
$pad = 12
$cx0 = [math]::Max(0, $minX - $pad); $cy0 = [math]::Max(0, $minY - $pad)
$cx1 = [math]::Min($src.Width - 1, $maxX + $pad); $cy1 = [math]::Min($src.Height - 1, $maxY + $pad)
$cw = $cx1 - $cx0 + 1
$ch = $cy1 - $cy0 + 1
Write-Host "Contenido detectado: $cw x $ch (origen $cx0,$cy0)"

# --- 2. Componer un lienzo cuadrado blanco con el recorte -------------------
function New-SquareCanvas($x0, $y0, $w, $h) {
    $side = [math]::Max($w, $h)
    $bmp = New-Object System.Drawing.Bitmap($side, $side)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::White)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $dst = New-Object System.Drawing.Rectangle([int](($side - $w) / 2), [int](($side - $h) / 2), $w, $h)
    $srcR = New-Object System.Drawing.Rectangle($x0, $y0, $w, $h)
    $g.DrawImage($src, $dst, $srcR, [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()
    return $bmp
}

# --- 3. Reducir con calidad (y saturar opcionalmente) ----------------------
function Save-Resized($bmp, [int]$size, [string]$path, [double]$saturation) {
    $out = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($out)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode  = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.SmoothingMode    = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    if ($saturation -ne 1.0) {
        $s = $saturation
        $lr = 0.3086; $lg = 0.6094; $lb = 0.0820
        $cm = New-Object System.Drawing.Imaging.ColorMatrix
        $cm.Matrix00 = ($lr * (1 - $s) + $s); $cm.Matrix01 = ($lr * (1 - $s));       $cm.Matrix02 = ($lr * (1 - $s))
        $cm.Matrix10 = ($lg * (1 - $s));       $cm.Matrix11 = ($lg * (1 - $s) + $s); $cm.Matrix12 = ($lg * (1 - $s))
        $cm.Matrix20 = ($lb * (1 - $s));       $cm.Matrix21 = ($lb * (1 - $s));       $cm.Matrix22 = ($lb * (1 - $s) + $s)
        $cm.Matrix33 = 1.0; $cm.Matrix44 = 1.0
        $ia = New-Object System.Drawing.Imaging.ImageAttributes
        $ia.SetColorMatrix($cm)
        $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
        $g.DrawImage($bmp, $rect, 0, 0, $bmp.Width, $bmp.Height, [System.Drawing.GraphicsUnit]::Pixel, $ia)
        $ia.Dispose()
    } else {
        $g.DrawImage($bmp, 0, 0, $size, $size)
    }
    $g.Dispose()
    $out.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $out.Dispose()
    Write-Host ("  {0}  ({1} px, sat={2})" -f (Split-Path -Leaf $path), $size, $saturation)
}

# --- 4. Generar -------------------------------------------------------------
$full = New-SquareCanvas $cx0 $cy0 $cw $ch
$zw = [int]($cw * 0.60); $zh = [int]($ch * 0.60)
$zoom = New-SquareCanvas ($cx0 + [int](($cw - $zw) / 2)) ($cy0 + [int](($ch - $zh) / 2)) $zw $zh

Save-Resized $zoom 16 (Join-Path $outIcons 'icon-16.png')  1.45
Save-Resized $zoom 32 (Join-Path $outIcons 'icon-32.png')  1.35
Save-Resized $full 48 (Join-Path $outIcons 'icon-48.png')  1.0
Save-Resized $full 128 (Join-Path $outIcons 'icon-128.png') 1.0
Save-Resized $full 96 (Join-Path $outBrand 'truekeate-mark-96.png') 1.0

$full.Dispose(); $zoom.Dispose(); $src.Dispose()
Write-Host "Iconos generados en public/icons y public/brand"
