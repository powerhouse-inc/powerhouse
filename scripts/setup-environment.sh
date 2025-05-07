#!/usr/bin/env bash

# Initialize global ph project if not already initialized
if [ ! -d "$HOME/.ph" ]; then
    ph setup-globals
fi

# Update and upgrade system packages
sudo apt update
sudo DEBIAN_FRONTEND=noninteractive apt upgrade -y

# Install required packages
sudo apt install -y postgresql postgresql-contrib nginx

# Interactive package installation loop
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Package Installation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
while true; do
    read -p "Enter package name to install (or press Enter to skip): " package_name
    if [ -z "$package_name" ]; then
        break
    fi
    ph install "$package_name"
done

# Database Configuration
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Database Configuration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Choose database type:"
echo "1) Local PostgreSQL database"
echo "2) Remote PostgreSQL database"
read -p "Enter your choice (1 or 2): " db_choice

if [ "$db_choice" = "1" ]; then
    echo "Setting up local PostgreSQL database..."
    
    # Generate a random password for the database user
    DB_PASSWORD=$(openssl rand -base64 32)
    DB_USER="powerhouse"
    DB_NAME="powerhouse"
    
    # Create database and user
    sudo -u postgres psql << EOF
CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
CREATE DATABASE $DB_NAME OWNER $DB_USER;
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
EOF
    
    # Configure PostgreSQL to accept local connections
    sudo sed -i "s/#listen_addresses = 'localhost'/listen_addresses = 'localhost'/" /etc/postgresql/*/main/postgresql.conf
    
    # Set DATABASE_URL for local database
    DATABASE_URL="postgres://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"
    
    echo "Local database configured successfully!"
    echo "Database URL: $DATABASE_URL"
    echo "Please save these credentials securely!"
else
    echo "Enter remote PostgreSQL URL (format: postgres://user:password@host:port/db)"
    echo "Example: postgres://powerhouse:password@db.example.com:5432/powerhouse"
    read -p "DATABASE_URL: " DATABASE_URL
fi

# Save DATABASE_URL to .env file
echo "DATABASE_URL=$DATABASE_URL" | sudo tee -a $HOME/.ph/.env

# SSL Configuration choice
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SSL Configuration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Choose SSL configuration:"
echo "1) Let's Encrypt certificates for domains"
echo "2) Self-signed certificate for machine hostname"
read -p "Enter your choice (1 or 2): " ssl_choice

if [ "$ssl_choice" = "1" ]; then
    # Install certbot for Let's Encrypt
    sudo apt install -y certbot python3-certbot-nginx
    
    # Domain setup
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Domain Setup"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    read -p "Enter base domain (e.g. powerhouse.xyz): " base_domain
    read -p "Enter subdomain for Connect service (default: connect): " connect_subdomain
    read -p "Enter subdomain for Switchboard service (default: switchboard): " switchboard_subdomain

    # Set default subdomains if not provided
    connect_subdomain=${connect_subdomain:-connect}
    switchboard_subdomain=${switchboard_subdomain:-switchboard}

    # Construct full domains
    connect_domain="${connect_subdomain}.${base_domain}"
    switchboard_domain="${switchboard_subdomain}.${base_domain}"

    echo "Using domains:"
    echo "Connect: $connect_domain"
    echo "Switchboard: $switchboard_domain"

    # Generate temporary SSL certificates
    echo "Generating temporary SSL certificates..."
    sudo mkdir -p /etc/nginx/ssl
    sudo openssl req -x509 -nodes -days 1 -newkey rsa:2048 \
        -keyout /etc/nginx/ssl/temp.key \
        -out /etc/nginx/ssl/temp.crt \
        -subj "/CN=$base_domain" \
        -addext "subjectAltName = DNS:$connect_domain,DNS:$switchboard_domain"

    # Create Nginx configuration for domains
    echo "Creating Nginx configuration..."
    sudo tee /etc/nginx/sites-available/powerhouse > /dev/null << EOF
# Security headers
add_header Strict-Transport-Security "max-age=63072000" always;
add_header X-Frame-Options DENY;
add_header X-Content-Type-Options nosniff;
add_header X-XSS-Protection "1; mode=block";

server {
    listen 80;
    server_name $connect_domain $switchboard_domain;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $connect_domain;
    
    ssl_certificate /etc/nginx/ssl/temp.crt;
    ssl_certificate_key /etc/nginx/ssl/temp.key;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}

server {
    listen 443 ssl http2;
    server_name $switchboard_domain;
    
    ssl_certificate /etc/nginx/ssl/temp.crt;
    ssl_certificate_key /etc/nginx/ssl/temp.key;
    
    location / {
        proxy_pass http://localhost:4001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

    # Enable the site
    sudo ln -sf /etc/nginx/sites-available/powerhouse /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/default

    # Test Nginx configuration
    sudo nginx -t

    # Restart Nginx
    sudo systemctl restart nginx

    # Obtain SSL certificates
    echo "Obtaining SSL certificates..."
    sudo certbot --nginx -d $connect_domain -d $switchboard_domain --non-interactive --agree-tos --email admin@$base_domain

    # Remove temporary certificates
    sudo rm -f /etc/nginx/ssl/temp.*

else
    # Get machine hostname
    hostname=$(hostname)
    
    # Generate self-signed certificate
    echo "Generating self-signed certificate for $hostname..."
    sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout /etc/ssl/private/$hostname.key \
        -out /etc/ssl/certs/$hostname.crt \
        -subj "/CN=$hostname" \
        -addext "subjectAltName = DNS:$hostname"

    # Create Nginx configuration for self-signed
    echo "Creating Nginx configuration..."
    sudo tee /etc/nginx/sites-available/powerhouse > /dev/null << EOF
# Security headers
add_header Strict-Transport-Security "max-age=63072000" always;
add_header X-Frame-Options DENY;
add_header X-Content-Type-Options nosniff;
add_header X-XSS-Protection "1; mode=block";

server {
    listen 80;
    server_name $hostname;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $hostname;
    
    ssl_certificate /etc/ssl/certs/$hostname.crt;
    ssl_certificate_key /etc/ssl/private/$hostname.key;
    
    location /connect {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /switchboard {
        proxy_pass http://localhost:4001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

    # Enable the site
    sudo ln -sf /etc/nginx/sites-available/powerhouse /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/default

    # Test Nginx configuration
    sudo nginx -t

    # Restart Nginx
    sudo systemctl restart nginx
fi

# Install PM2 globally if not already installed
if ! command -v pm2 &> /dev/null; then
    pnpm install -g pm2
fi

cd $HOME/.ph
ph use dev # workaround: staging is broken
pnpm prisma db push --schema node_modules/document-drive/dist/prisma/schema.prisma

# Start services with PM2
echo "Starting services with PM2..."
if [ "$ssl_choice" = "2" ]; then
    # Self-signed certificate - use base paths
    pm2 start pnpm connect --name "connect" -- --base-path /connect
    pm2 start pnpm switchboard --name "switchboard" -- --base-path /switchboard
else
    # Let's Encrypt - no base paths needed
    pm2 start pnpm connect --name "connect"
    pm2 start pnpm switchboard --name "switchboard" 
fi

# Save PM2 process list and setup startup script
pm2 save
pm2 startup

# Node.js setup