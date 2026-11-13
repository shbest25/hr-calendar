# Python/Node 없이 PowerShell만으로 public/ 폴더를 http://localhost:8765 로 내보내는 정적 서버.
# 사용법:  powershell -NoProfile -ExecutionPolicy Bypass -File serve.ps1
# 끄려면 이 창에서 Ctrl+C.
param([int]$Port = 8765)

$root = Join-Path $PSScriptRoot "public"
if (-not (Test-Path (Join-Path $root "index.html"))) {
  Write-Host "public\index.html 을 찾을 수 없습니다. serve.ps1 은 hr_test 폴더 안에 있어야 합니다."
  exit 1
}
$root = (Resolve-Path $root).Path

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".mjs"  = "text/javascript; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".ico"  = "image/x-icon"
  ".woff" = "font/woff"
  ".woff2"= "font/woff2"
  ".txt"  = "text/plain; charset=utf-8"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "HR 캘린더 서버 켜짐: http://localhost:$Port/#/calendar  (끄려면 Ctrl+C)"

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    try {
      $rel = [Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart("/")
      if ($rel -eq "") { $rel = "index.html" }
      $path = [IO.Path]::GetFullPath((Join-Path $root $rel))
      if ((Test-Path $path -PathType Container)) { $path = Join-Path $path "index.html" }
      if (-not $path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $path -PathType Leaf)) {
        $res.StatusCode = 404
        $bytes = [Text.Encoding]::UTF8.GetBytes("404 Not Found: $rel")
      } else {
        $ext = [IO.Path]::GetExtension($path).ToLower()
        $type = $mime[$ext]
        if (-not $type) { $type = "application/octet-stream" }
        $res.ContentType = $type
        $res.Headers["Cache-Control"] = "no-store"
        $bytes = [IO.File]::ReadAllBytes($path)
      }
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch {
      try { $res.StatusCode = 500 } catch {}
    } finally {
      $res.OutputStream.Close()
    }
  }
} finally {
  $listener.Stop()
}
