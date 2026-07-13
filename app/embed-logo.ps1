$outPath = "C:\Users\Alexp\OneDrive\Pictures\Desktop\New folder (3)\app\lib\logoBase64.ts"

# Search common locations for logo.png
$searchPaths = @(
    "C:\Users\Alexp\Downloads\logo.png",
    "C:\Users\Alexp\Desktop\logo.png",
    "C:\Users\Alexp\Pictures\logo.png",
    "C:\Users\Alexp\OneDrive\Desktop\logo.png",
    "C:\Users\Alexp\OneDrive\Pictures\logo.png",
    "C:\Users\Alexp\OneDrive\Pictures\Desktop\New folder (3)\app\public\logo.png"
)

$logoPath = $null
foreach ($p in $searchPaths) {
    if (Test-Path $p) {
        $logoPath = $p
        Write-Host "Found logo at: $p"
        break
    }
}

if (-not $logoPath) {
    Write-Host "Could not find logo.png. Please enter the full path to your logo file:"
    $logoPath = Read-Host "Path"
}

$bytes = [System.IO.File]::ReadAllBytes($logoPath)
$base64 = [Convert]::ToBase64String($bytes)
$content = 'export const LOGO_BASE64 = "data:image/png;base64,' + $base64 + '";'
[System.IO.File]::WriteAllText($outPath, $content, [System.Text.Encoding]::UTF8)
Write-Host "Done - logo embedded successfully"
