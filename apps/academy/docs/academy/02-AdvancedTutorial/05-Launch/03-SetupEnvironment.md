# Powerhouse Setup Guide

## Introduction
Powerhouse is a powerful platform that helps you manage and deploy your applications efficiently. This guide will walk you through the process of setting up both the Powerhouse CLI and configuring your server machine to run Powerhouse services. Whether you're setting up a development environment or preparing for production deployment, this guide provides all the necessary steps and considerations.

## Prerequisites
Before you begin, ensure you have a Linux-based system (Ubuntu or Debian recommended), sudo privileges, and a stable internet connection. These are essential for the installation and configuration process. The system should have at least 1GB of RAM and 10GB of free disk space for optimal performance. While these are minimum requirements, more resources will provide better performance, especially when running multiple services.

## 1. Installing Powerhouse CLI

The `install-tools.sh` script provides a streamlined way to install the Powerhouse CLI tool and all its necessary dependencies. This script handles the installation of node.js 22, pnpm, and the Powerhouse CLI itself. It's designed to work across different Linux distributions, though it's optimized for Ubuntu and Debian-based systems.

### Installation Steps:
1. Download the setup script:
```bash
curl -O https://raw.githubusercontent.com/powerhouse-inc/powerhouse/refs/heads/main/scripts/install-tools.sh
```

2. Make the script executable:
```bash
chmod +x install-tools.sh
```

3. Run the script:
```bash
./install-tools.sh
```

4. Choose a version when prompted:
   - `dev`: Development version - Use this for testing new features or development work
   - `staging`: Staging version - Use this for pre-production testing
   - RECOMMENDED: `latest`: Latest stable version - Recommended for production environments
   - Press Enter to go ahead with the latest version

5. After installation, source your shell configuration:
```bash
source ~/.bashrc  # or source ~/.zshrc if using zsh
```

6. Verify the installation:
```bash
ph --version
```

## 2. Configuring Your Machine

Download the setup script:
```bash
curl -O  https://raw.githubusercontent.com/powerhouse-inc/powerhouse/refs/heads/main/scripts/setup-environment.sh
```

The `setup-environment.sh` script is a comprehensive tool that prepares your machine for running Powerhouse services. It handles everything from package installation to service configuration, making the setup process straightforward and automated. This script is particularly useful for setting up new servers or reconfiguring existing ones.

### Configuration Steps:

1. Make the script executable:
```bash
chmod +x setup-environment.sh
```

2. Run the script:
```bash
./setup-environment.sh
```

3. Follow the interactive prompts:

### Step 1: Package Installation
During the package installation phase, you'll be prompted to enter package names that you want to install. For example, you might want to install `@sky-ph/atlas` or other Powerhouse packages. This step is crucial for adding the specific functionality you need to your Powerhouse installation. You can press Enter to skip this step if you don't need to install any packages immediately, but you can always install packages later using the `ph install` command.

### Step 2: Database Configuration
The script offers two options for database configuration. 

**Option 1:** Sets up a local PostgreSQL database, which is ideal for development or small deployments. It automatically creates a database user with a secure random password and configures the database to accept local connections. This option is perfect for getting started quickly or for development environments. 

**Option 2:** Allows you to connect to a remote PostgreSQL database by providing a connection URL in the format `postgres://user:password@host:port/db`. This is recommended for production environments where you might want to use a managed database service or a dedicated database server.

### Step 3: SSL Configuration
For SSL configuration, you have two choices. 

**Option 1:** The **Let's Encrypt** option is recommended for production environments. It requires you to provide a base domain (like `powerhouse.xyz`) and optional subdomains for your services. The script will automatically obtain and configure SSL certificates for your domains, ensuring secure communication between your services and clients. 

**Option 2:** The self-signed certificate option is suitable for development or testing environments. It uses your machine's hostname and generates a self-signed certificate, configuring the services with appropriate base paths. While this option is convenient for development, browsers will show security warnings, which is why it's not recommended for production use.

<details>
<summary>Setting up a domain in DigitalOcean</summary>

This tutorial will guide you through the process of creating a new virtual private server (called a "Droplet") on DigitalOcean and then pointing your custom domain name to it. This will allow users to access your server using a memorable URL like `www.yourdomain.com`.

**Current Date:** May 15, 2025

## Part 1: Setting Up Your DigitalOcean Droplet

A Droplet is a scalable virtual machine that you can configure to host your websites, applications, or other services.

### Step 1: Sign Up or Log In to DigitalOcean

- If you don't have an account, go to [digitalocean.com](https://digitalocean.com) and sign up. You'll likely need to provide payment information.
- If you already have an account, log in.

### Step 2: Create a New Droplet

1. From your DigitalOcean dashboard, click the green "Create" button in the top right corner and select "Droplets".

2. **Choose an Image:**
   - **Distributions:** Select a base Linux distribution like Ubuntu (a popular choice, e.g., Ubuntu 22.04 LTS), Fedora, Debian, etc.
   - **Marketplace:** You can also choose from pre-configured 1-Click Apps (e.g., WordPress, Docker, LAMP stack). This can save you setup time. For this general tutorial, we'll assume a base distribution.

3. **Choose a Plan (Size):**
   - **Shared CPU:** Good for smaller projects, development, or low-traffic sites. Options like "Basic" Droplets fall here.
   - **Dedicated CPU:** For production applications needing consistent performance (General Purpose, CPU-Optimized, Memory-Optimized, Storage-Optimized Droplets).
   - Start with a basic plan that fits your budget and expected needs; you can resize your Droplet later if necessary.

4. **Choose a Datacenter Region:**
   - Select a server location closest to your target audience to minimize latency.
   - For example, if your users are primarily in Europe, choose a European datacenter like Amsterdam, Frankfurt, or London.

5. **Authentication:**
   - **SSH Keys (Recommended for security):** If you have an SSH key pair, you can add your public key. This is more secure than using passwords. Click "New SSH Key" and paste your public key if it's not already added.
   - **Password:** If you choose this, create a strong root password. You'll use this to log in via SSH initially.

6. **Additional Options (Customize as needed):**
   - **VPC Network:** By default, your Droplet will be in your default VPC for the chosen region. You can change this if you have custom networking setups.
   - **Monitoring:** A free metrics monitoring service. It's a good idea to enable this.
   - **User Data:** Allows you to run initial configuration scripts when the Droplet is first created.
   - **Backups (Recommended for production):** Enable automated weekly backups for a small additional fee.
   - **Volume (Additional Storage):** Attach block storage if you need more disk space than the Droplet plan offers.

7. **Finalize and Create:**
   - Choose a Hostname: Give your Droplet a name (e.g., `my-web-server`). This is for your reference within DigitalOcean.
   - Add Tags (Optional): Organize your resources with tags.
   - Select Project: Assign the Droplet to a project.
   - Review your selections and click the "Create Droplet" button at the bottom.

### Step 3: Access Your Droplet

It will take a minute or two for your Droplet to be provisioned. Once it's ready, its IP address will be displayed in your Droplets list.

To log in via SSH:

1. Open a terminal (on macOS/Linux) or an SSH client like PuTTY (on Windows).
2. Use one of these commands:
   ```bash
   # If using password authentication
   ssh root@YOUR_DROPLET_IP

   # If using SSH key for a specific user
   ssh your_user@YOUR_DROPLET_IP

   # If using a specific SSH key
   ssh -i /path/to/your/private_key root@YOUR_DROPLET_IP
   ```

3. If you used a password, you'll be prompted to enter it.
4. If it's your first time logging in, you might be asked to change the root password.

Now your Droplet is running! You'll likely want to install and configure a web server (like Nginx or Apache) and your application or website files. This part is beyond the scope of just creating the Droplet but is crucial for it to do anything useful.

### DNS Configuration

#### Option A: Using DigitalOcean's Nameservers (Recommended)

1. **Add Your Domain to DigitalOcean:**
   - Go to "Networking" → "Domains"
   - Enter your domain name (e.g., `yourdomain.com`)
   - Click "Add Domain"

2. **Update Nameservers at Your Domain Registrar:**
   - Log in to your domain registrar
   - Update nameservers to:
     ```
     ns1.digitalocean.com
     ns2.digitalocean.com
     ns3.digitalocean.com
     ```

3. **Create DNS Records:**
   - **Root Domain (A Record):**
     - **TYPE:** A
     - **HOSTNAME:** @
     - **WILL DIRECT TO:** Your Droplet's IP
     - **TTL:** 3600

   - **WWW Subdomain (A Record):**
     - **TYPE:** A
     - **HOSTNAME:** www
     - **WILL DIRECT TO:** Your Droplet's IP
     - **TTL:** 3600

#### Option B: Using Your Existing Nameservers

1. **Create DNS Records at Your Registrar:**
   - **Root Domain (A Record):**
     - **TYPE:** A
     - **HOSTNAME:** @
     - **VALUE:** Your Droplet's IP
     - **TTL:** 3600

   - **WWW Subdomain (A Record):**
     - **TYPE:** A
     - **HOSTNAME:** www
     - **VALUE:** Your Droplet's IP
     - **TTL:** 3600

**Note:** DNS changes may take up to 48 hours to propagate globally.

### Verify Configuration

1. Use DNS lookup tools to verify your records:
   ```bash
   dig +short yourdomain.com
   dig +short www.yourdomain.com
   ```

2. Both should return your Droplet's IP address

**Congratulations!** You have successfully set up your DigitalOcean Droplet and configured your domain. Your server is now ready to host your Powerhouse services.

</details>

<details>
<summary>Setting up a domain with AWS EC2</summary>

This tutorial will guide you through the process of assigning a static IP (Elastic IP) to your EC2 instance and configuring your domain to point to it.

**Current Date:** May 15, 2025

## Part 1: Assigning a Static IP to EC2 Instance

### Step 1: Allocate Elastic IP

1. Navigate to the EC2 service in the AWS console
2. Choose "Elastic IPs" from the navigation pane
3. Select "Allocate new address"
4. Select the VPC where your EC2 instance is located
5. Click "Allocate"

### Step 2: Associate Elastic IP

1. Go back to the EC2 console and select your instance
2. From the "Networking" tab, expand "Network interfaces"
3. Note the "Interface ID" of the network interface
4. Select the "Interface ID" to manage its IP addresses
5. Choose "Actions", then "Manage IP Addresses"
6. Find the Elastic IP you allocated and click "Associate"

## Part 2: DNS Configuration

### Option A: Using AWS Route 53 (Recommended)

1. **Add Your Domain to Route 53:**
   - Go to Route 53 → "Hosted zones"
   - Click "Create hosted zone"
   - Enter your domain name (e.g., `yourdomain.com`)
   - Click "Create"

2. **Update Nameservers at Your Domain Registrar:**
   - Log in to your domain registrar
   - Update nameservers to the ones provided by Route 53
   - They will look like:
     ```
     ns-1234.awsdns-12.org
     ns-567.awsdns-34.com
     ns-890.awsdns-56.net
     ns-1234.awsdns-78.co.uk
     ```

3. **Create DNS Records:**
   - **Root Domain (A Record):**
     - **TYPE:** A
     - **HOSTNAME:** @
     - **VALUE:** Your Elastic IP
     - **TTL:** 3600

   - **WWW Subdomain (A Record):**
     - **TYPE:** A
     - **HOSTNAME:** www
     - **VALUE:** Your Elastic IP
     - **TTL:** 3600

### Option B: Using Your Existing Nameservers

1. **Create DNS Records at Your Registrar:**
   - **Root Domain (A Record):**
     - **TYPE:** A
     - **HOSTNAME:** @
     - **VALUE:** Your Elastic IP
     - **TTL:** 3600

   - **WWW Subdomain (A Record):**
     - **TYPE:** A
     - **HOSTNAME:** www
     - **VALUE:** Your Elastic IP
     - **TTL:** 3600

1. **Set Up DNS First:**
   - Create A records for all subdomains before running the setup script
   - Point them to your EC2 instance's public IP address
   - Wait for DNS propagation before requesting SSL certificates

### Verify Configuration

1. Use DNS lookup tools to verify your records:
   ```bash
   dig +short yourdomain.com
   dig +short www.yourdomain.com
   ```

2. Both should return your Elastic IP address

**Congratulations!** You have successfully set up your EC2 instance with a static IP and configured your domain. Your server is now ready to host your Powerhouse services.

</details>

### Step 4: Service Configuration

The script takes care of all the necessary service configuration automatically. It installs and configures **Nginx** as a reverse proxy, sets up SSL certificates, and configures the proxy settings for optimal performance. It also installs **PM2** for process management and starts your services with the appropriate configuration based on your SSL choice. The Nginx configuration includes optimizations for **WebSocket connections**, static file serving, and security headers. PM2 is configured to automatically restart services if they crash and to start them on system boot.

### Step 5: Security Features
Security is a top priority in the setup process. The script implements automatic SSL certificate management, generates secure database passwords, and configures security headers in Nginx. It also sets up proper proxy settings to support WebSocket connections securely. The security headers include protection against common web vulnerabilities, and the SSL configuration uses modern cipher suites and protocols. The script also ensures that sensitive files and directories have appropriate permissions.


## 3. Verifying the Setup

After the installation is complete, it's important to verify that everything is working correctly. You can check the status of your services using PM2, verify the Nginx configuration, and ensure your SSL certificates are properly installed. This step is crucial for identifying any potential issues before they affect your users.

1. Check service status:
```bash
pm2 status
```

2. View Nginx configuration:
```bash
sudo nginx -t
```

3. Check SSL certificates:
```bash
sudo certbot certificates  # if using Let's Encrypt
```

## 4. Accessing Services

Once everything is set up, you can access your services through the configured domains. If you chose Let's Encrypt, your services will be available at their respective subdomains. With a self-signed certificate, you'll access the services through your machine's hostname with the appropriate base paths. The services are configured to use HTTPS by default, ensuring secure communication.

### With Let's Encrypt:
- Connect: `https://connect.yourdomain.com`
- Switchboard: `https://switchboard.yourdomain.com`

### With Self-signed Certificate:
- Connect: `https://your-hostname/connect`
- Switchboard: `https://your-hostname/switchboard`

## 5. Troubleshooting

When issues arise, there are several common problems you might encounter. 
- The "ph: command not found" error usually means you need to source your shell configuration file. 
- Nginx configuration errors can be investigated through the error logs, and service issues can be diagnosed using PM2 logs. 
- SSL certificate problems often relate to DNS settings or certificate paths. Understanding these common issues and their solutions will help you maintain a stable Powerhouse installation.

### Common Issues:
1. **"ph: command not found"**
   - Run `source ~/.bashrc` or restart your terminal
   - Verify that the PNPM_HOME environment variable is set correctly
   - Check if the ph binary exists in the PNPM_HOME directory

2. **Nginx configuration errors**
   - Check logs: `sudo tail -f /var/log/nginx/error.log`
   - Verify that all required modules are installed
   - Ensure that the SSL certificate paths are correct

3. **Service not starting**
   - Check PM2 logs: `pm2 logs`
   - Verify that the service ports are not in use
   - Check if the service has the required permissions

4. **SSL certificate issues**
   - Verify domain DNS settings
   - Check certificate paths in Nginx config
   - Ensure that the certificate files are readable by Nginx

## 6. Maintenance

Regular maintenance is crucial for keeping your Powerhouse installation running smoothly. You can update services using the Powerhouse CLI, restart services through PM2, and monitor logs to ensure everything is functioning correctly. Regular maintenance helps prevent issues and ensures that your services are running with the latest security patches and features.

### Updating Services:
```bash
ph update <package-name>
```

### Restarting Services:
```bash
pm2 restart all
```

### Viewing Logs:
```bash
pm2 logs
```

## 7. Security Notes

Maintaining security is an ongoing process. It's essential to keep your database credentials secure and regularly update your SSL certificates. Regular monitoring of system logs helps identify potential security issues, and keeping your system and packages updated ensures you have the latest security patches. Consider implementing additional security measures such as firewall rules, intrusion detection systems, and regular security audits.

## 8. Backup

Regular backups are crucial for data safety. The database can be backed up using pg_dump, and your configuration files can be archived using tar. These backups should be stored securely and tested regularly to ensure they can be restored if needed. Consider implementing an automated backup schedule and storing backups in multiple locations for redundancy.

### Database Backup:
```bash
pg_dump -U powerhouse -d powerhouse > backup.sql
```

### Configuration Backup:
```bash
sudo tar -czf powerhouse-config.tar.gz /etc/powerhouse/
```

## 9. Best Practices

To get the most out of your Powerhouse installation, follow these best practices:

1. **Regular Updates**: Keep your system, packages, and services updated to the latest stable versions.
2. **Monitoring**: Set up monitoring for your services to detect issues early.
3. **Documentation**: Keep documentation of your configuration and any customizations.
4. **Testing**: Test your backup and restore procedures regularly.
5. **Security**: Regularly review and update your security measures.

## 10. Getting Help

If you encounter issues or need assistance, there are several resources available:

1. **Documentation**: Check the official Powerhouse documentation for detailed information.
2. **Community**: Join the Powerhouse community forums or chat channels.
3. **Support**: Contact Powerhouse support for professional assistance.
4. **GitHub**: Report issues or contribute to the project on GitHub. 
