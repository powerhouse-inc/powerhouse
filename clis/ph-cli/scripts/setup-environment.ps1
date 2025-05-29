# PowerShell script for setting up Powerhouse environment on Windows
param(
    [string]$TARGET_TAG = "latest"
)

# Function to check if running as administrator
function Test-Administrator {
    $user = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal $user
    $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
}

# Check if running as administrator
if (-not (Test-Administrator)) {
    Write-Host "Please run this script as Administrator" -ForegroundColor Red
    exit 1
}

# Install required packages using winget
Write-Host "Installing required packages..."
winget install -e --id PostgreSQL.PostgreSQL
winget install -e --id NGINX.NGINX

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host "  Setting up global project"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Create installation directory if it doesn't exist
$installPath = "C:\www"
if (-not (Test-Path $installPath)) {
    New-Item -ItemType Directory -Path $installPath
}
Set-Location $installPath

# Initialize Powerhouse project
ph init powerhouse
Set-Location powerhouse
ph use $TARGET_TAG
ph connect build

# Interactive package installation loop
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host "  Package Installation"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
while ($true) {
    $package_name = Read-Host "Enter package name to install (or press Enter to skip)"
    if ([string]::IsNullOrEmpty($package_name)) {
        break
    }
    ph install $package_name
}

# Database Configuration
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host "  Database Configuration"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host "Choose database type:"
Write-Host "1) Local PostgreSQL database"
Write-Host "2) Remote PostgreSQL database"
$db_choice = Read-Host "Enter your choice (1 or 2)"

if ($db_choice -eq "1") {
    Write-Host "Setting up local PostgreSQL database..."
    
    # Generate database credentials
    $DB_PASSWORD = "powerhouse"
    $DB_USER = "powerhouse"
    $DB_NAME = "powerhouse"
    
    # Create database and user using psql
    $env:PGPASSWORD = "postgres"  # Default PostgreSQL password
    psql -U postgres -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"
    psql -U postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
    psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
    
    # Set DATABASE_URL for local database
    $DATABASE_URL = "postgresql://$DB_USER`:$DB_PASSWORD@localhost:5432/$DB_NAME"
    
    Write-Host "Local database configured successfully!"
    Write-Host "Database URL: $DATABASE_URL"
    Write-Host "Please save these credentials securely!"
} else {
    Write-Host "Enter remote PostgreSQL URL (format: postgresql://user:password@host:port/db)"
    Write-Host "Example: postgresql://powerhouse:password@db.example.com:5432/powerhouse"
    $DATABASE_URL = Read-Host "DATABASE_URL"
}

# Save DATABASE_URL to .env file
Add-Content -Path "$installPath\powerhouse\.env" -Value "DATABASE_URL=$DATABASE_URL"

# SSL Configuration choice
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host "  SSL Configuration"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host "Choose SSL configuration:"
Write-Host "1) Let's Encrypt certificates for domains"
Write-Host "2) Self-signed certificate for machine hostname"
$ssl_choice = Read-Host "Enter your choice (1 or 2)"

if ($ssl_choice -eq "1") {
    # Install certbot for Let's Encrypt
    winget install -e --id Certbot.Certbot
    
    # Domain setup
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    Write-Host "  Domain Setup"
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    $base_domain = Read-Host "Enter base domain (e.g. powerhouse.xyz)"
    $connect_subdomain = Read-Host "Enter subdomain for Connect service (default: connect)"
    $switchboard_subdomain = Read-Host "Enter subdomain for Switchboard service (default: switchboard)"

    # Set default subdomains if not provided
    if ([string]::IsNullOrEmpty($connect_subdomain)) { $connect_subdomain = "connect" }
    if ([string]::IsNullOrEmpty($switchboard_subdomain)) { $switchboard_subdomain = "switchboard" }

    # Construct full domains
    $connect_domain = "$connect_subdomain.$base_domain"
    $switchboard_domain = "$switchboard_subdomain.$base_domain"

    Write-Host "Using domains:"
    Write-Host "Connect: $connect_domain"
    Write-Host "Switchboard: $switchboard_domain"

    # Generate temporary SSL certificates
    Write-Host "Generating temporary SSL certificates..."
    $sslPath = "C:\nginx\ssl"
    if (-not (Test-Path $sslPath)) {
        New-Item -ItemType Directory -Path $sslPath
    }

    # Create Nginx configuration for domains
    $nginxConfig = @"
# Security headers
add_header Strict-Transport-Security "max-age=63072000" always;
add_header X-Frame-Options DENY;
add_header X-Content-Type-Options nosniff;
add_header X-XSS-Protection "1; mode=block";

server {
    listen 80;
    server_name $connect_domain $switchboard_domain;
    return 301 https://`$host`$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $connect_domain;
    
    ssl_certificate $sslPath\temp.crt;
    ssl_certificate_key $sslPath\temp.key;
    
    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;
    ssl_stapling on;
    ssl_stapling_verify on;

    if (`$http_x_forwarded_proto = "http") {
      return 301 https://`$server_name`$request_uri;
    }
    
    location / {
        root C:/www/powerhouse/.ph/connect-build/dist;
        try_files `$uri `$uri/ /index.html;
        add_header Cache-Control "no-cache";
        add_header X-Forwarded-Proto `$scheme;
        add_header X-Forwarded-Host `$host;
        add_header X-Forwarded-Port `$server_port;
    }
}

server {
    listen 443 ssl http2;
    server_name $switchboard_domain;
    
    ssl_certificate $sslPath\temp.crt;
    ssl_certificate_key $sslPath\temp.key;
    
    location / {
        proxy_pass http://localhost:4001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade `$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host `$host;
        proxy_cache_bypass `$http_upgrade;
        proxy_set_header X-Real-IP `$remote_addr;
        proxy_set_header X-Forwarded-For `$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto `$scheme;
    }
}
"@

    # Save Nginx configuration
    $nginxConfig | Out-File -FilePath "C:\nginx\conf\sites-available\powerhouse.conf" -Encoding UTF8

    # Create symbolic link to enable the site
    if (-not (Test-Path "C:\nginx\conf\sites-enabled")) {
        New-Item -ItemType Directory -Path "C:\nginx\conf\sites-enabled"
    }
    New-Item -ItemType SymbolicLink -Path "C:\nginx\conf\sites-enabled\powerhouse.conf" -Target "C:\nginx\conf\sites-available\powerhouse.conf" -Force

    # Test Nginx configuration
    nginx -t

    # Restart Nginx
    Stop-Service nginx
    Start-Service nginx

    # Obtain SSL certificates
    Write-Host "Obtaining SSL certificates..."
    certbot --nginx -d $connect_domain -d $switchboard_domain --non-interactive --agree-tos --email "admin@$base_domain"

} else {
    # Get machine hostname
    $hostname = [System.Net.Dns]::GetHostName()
    
    # Generate self-signed certificate
    Write-Host "Generating self-signed certificate for $hostname..."
    $sslPath = "C:\nginx\ssl"
    if (-not (Test-Path $sslPath)) {
        New-Item -ItemType Directory -Path $sslPath
    }

    # Create Nginx configuration for self-signed
    $nginxConfig = @"
# Security headers
add_header Strict-Transport-Security "max-age=63072000" always;
add_header X-Frame-Options DENY;
add_header X-Content-Type-Options nosniff;
add_header X-XSS-Protection "1; mode=block";

server {
    listen 80;
    server_name $hostname;
    return 301 https://`$host`$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $hostname;
    
    ssl_certificate $sslPath\$hostname.crt;
    ssl_certificate_key $sslPath\$hostname.key;
    
    location /connect {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade `$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host `$host;
        proxy_cache_bypass `$http_upgrade;
        proxy_set_header X-Real-IP `$remote_addr;
        proxy_set_header X-Forwarded-For `$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto `$scheme;
    }

    location /switchboard {
        proxy_pass http://localhost:4001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade `$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host `$host;
        proxy_cache_bypass `$http_upgrade;
        proxy_set_header X-Real-IP `$remote_addr;
        proxy_set_header X-Forwarded-For `$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto `$scheme;
    }
}
"@

    # Save Nginx configuration
    $nginxConfig | Out-File -FilePath "C:\nginx\conf\sites-available\powerhouse.conf" -Encoding UTF8

    # Create symbolic link to enable the site
    if (-not (Test-Path "C:\nginx\conf\sites-enabled")) {
        New-Item -ItemType Directory -Path "C:\nginx\conf\sites-enabled"
    }
    New-Item -ItemType SymbolicLink -Path "C:\nginx\conf\sites-enabled\powerhouse.conf" -Target "C:\nginx\conf\sites-available\powerhouse.conf" -Force

    # Test Nginx configuration
    nginx -t

    # Restart Nginx
    Stop-Service nginx
    Start-Service nginx
}

# Install PM2 globally if not already installed
if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
    pnpm install -g pm2
}

# Run database migrations
pnpm prisma db push --schema node_modules/document-drive/dist/prisma/schema.prisma
pnpm add @powerhousedao/switchboard@dev

# Start services with PM2
Write-Host "Starting services with PM2..."
if ($ssl_choice -eq "2") {
    # Self-signed certificate - use base paths
    pm2 start pnpm switchboard --name "switchboard" -- --base-path /switchboard
} else {
    # Let's Encrypt - no base paths needed
    pm2 start "pnpm switchboard" --name "switchboard"
}

# Save PM2 process list and setup startup script
pm2 save
pm2 startup 