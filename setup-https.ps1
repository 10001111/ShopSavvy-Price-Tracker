# PowerShell script to generate self-signed certificate for localhost
Write-Host "Setting up HTTPS for localhost..." -ForegroundColor Cyan
Write-Host ""

$certsDir = Join-Path $PSScriptRoot "certs"
$pfxPath = Join-Path $certsDir "localhost.pfx"

# Create certs directory if it doesn't exist
if (-not (Test-Path $certsDir)) {
    New-Item -ItemType Directory -Path $certsDir | Out-Null
    Write-Host "Created certs directory" -ForegroundColor Green
}

# Check if certificate already exists
if (Test-Path $pfxPath) {
    Write-Host "Certificates already exist" -ForegroundColor Green
    Write-Host ""
    Write-Host "Your certificate is ready at: $pfxPath"
    Write-Host ""
    Write-Host "HTTPS is ready! Start your server with: npm run dev" -ForegroundColor Green
    exit 0
}

Write-Host "Generating self-signed certificate..." -ForegroundColor Yellow

try {
    # Generate self-signed certificate using PowerShell
    $cert = New-SelfSignedCertificate -DnsName "localhost", "127.0.0.1" -CertStoreLocation "Cert:\CurrentUser\My" -NotAfter (Get-Date).AddYears(1) -FriendlyName "OfertaRadar Development Certificate" -KeyUsage DigitalSignature, KeyEncipherment -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.1")

    # Export to PFX
    $password = ConvertTo-SecureString -String "dev" -Force -AsPlainText
    Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $password | Out-Null

    Write-Host ""
    Write-Host "Certificate generated successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Certificate details:"
    Write-Host "  PFX:  $pfxPath (password: dev)"
    Write-Host "  Thumbprint: $($cert.Thumbprint)"
    Write-Host ""
    
    # Remove from certificate store (we don't need it there)
    Remove-Item -Path "Cert:\CurrentUser\My\$($cert.Thumbprint)" -Force

    Write-Host "HTTPS is ready! Start your server with: npm run dev" -ForegroundColor Green
    Write-Host ""
    Write-Host "Note: Your browser will show a security warning for self-signed certs." -ForegroundColor Yellow
    Write-Host "Click 'Advanced' then 'Proceed to localhost' to continue."
    
} catch {
    Write-Host ""
    Write-Host "Failed to generate certificate: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "You can still run without HTTPS (the app will use http://localhost:3000)"
    exit 1
}
