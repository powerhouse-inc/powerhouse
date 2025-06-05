# PowerShell script for Powerhouse installation

# Check if running as administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Please run this script as Administrator" -ForegroundColor Red
    exit 1
}

# Function to check if a command exists
function Test-Command($cmdname) {
    return [bool](Get-Command -Name $cmdname -ErrorAction SilentlyContinue)
}

# Check and install nvm if not present
if (-not (Test-Command nvm)) {
    Write-Host "Installing nvm..."
    # Download and install nvm-windows
    $nvmUrl = "https://github.com/coreybutler/nvm-windows/releases/download/1.1.11/nvm-setup.exe"
    $nvmInstaller = "$env:TEMP\nvm-setup.exe"
    Invoke-WebRequest -Uri $nvmUrl -OutFile $nvmInstaller
    Start-Process -FilePath $nvmInstaller -ArgumentList "/SILENT" -Wait
    Remove-Item $nvmInstaller
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
} else {
    Write-Host "nvm is already installed"
}

# Check and install Node.js if not present
if (-not (Test-Command node)) {
    Write-Host "Installing Node.js..."
    nvm install 22
    nvm use 22
} else {
    Write-Host "Node.js is already installed: $(node --version)"
}

# Check and install pnpm if not present
if (-not (Test-Command pnpm)) {
    Write-Host "Installing pnpm..."
    # Install pnpm using npm
    npm install -g pnpm
} else {
    Write-Host "pnpm is already installed: $(pnpm --version)"
}

# Verify pnpm is available
if (-not (Test-Command pnpm)) {
    Write-Host "Error: pnpm installation failed" -ForegroundColor Red
    exit 1
}

Write-Host "Installing latest version of ph-cmd..."
pnpm add -g ph-cmd@latest

# Verify ph command is available
if (-not (Test-Command ph)) {
    Write-Host "Error: ph command not found after installation" -ForegroundColor Red
    Write-Host "Please restart your terminal and try again"
    exit 1
}

Write-Host ""
Write-Host "  🎉 Setup Complete! 🎉" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host "  Please restart your terminal and then you can use Powerhouse by typing:"
Write-Host "  ph --version"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host "" 