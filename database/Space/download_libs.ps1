$baseUrl = "c:\GitHub\Xenoah.github.io\database\Space\lib"
$urls = @(
    "https://unpkg.com/react@18.2.0/umd/react.production.min.js",
    "https://unpkg.com/react-dom@18.2.0/umd/react-dom.production.min.js",
    "https://unpkg.com/recharts@2.12.3/umd/Recharts.min.js",
    "https://unpkg.com/history@5.3.0/umd/history.production.min.js",
    "https://unpkg.com/react-router@6.22.3/umd/react-router.production.min.js",
    "https://unpkg.com/react-router-dom@6.22.3/umd/react-router-dom.production.min.js",
    "https://unpkg.com/@babel/standalone/babel.min.js",
    "https://cdn.tailwindcss.com"
)

foreach ($url in $urls) {
    if ($url -eq "https://cdn.tailwindcss.com") {
        $filename = "tailwind.js"
    } elseif ($url -match ".*/([^/]+)$") {
        $filename = $matches[1]
    }
    
    $output = Join-Path $baseUrl $filename
    Write-Host "Downloading $url to $output..."
    Invoke-WebRequest -Uri $url -OutFile $output
}
