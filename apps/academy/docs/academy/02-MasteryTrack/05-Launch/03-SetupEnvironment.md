# Powerhouse Setup Guide

## Introduction
Powerhouse is a powerful platform that helps you manage and deploy your applications efficiently.   
This guide will walk you through the process of setting up both the Powerhouse CLI and configuring your server machine to run Powerhouse services. Whether you're setting up a development environment or preparing for production deployment, this guide provides all the necessary steps and considerations.

## Prerequisites
Before you begin, ensure you have a Linux-based system (Ubuntu or Debian recommended), sudo privileges, and a stable internet connection.   
These are essential for the installation and configuration process. 
The system should have at least 1GB of RAM and 10GB of free disk space for optimal performance. 
While these are minimum requirements, more resources will provide better performance, especially when running multiple services.

Also make sure you have your preferred domain registered and created subdomains for your Connect & Switchboard instances.

<details>
<summary>**Setting up a Droplet (Digital Ocean) instance and connecting your domain**</summary>

This tutorial will guide you through the process of creating a new virtual private server (called a "Droplet") on DigitalOcean and then pointing your custom domain name to it. This will allow users to access your server using a memorable URL like `www.yourdomain.com`.

**Current Date:** May 15, 2024

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

1. Open a terminal (on macOS/Linux) or an SSH client like PuTTY (on Windows). You can also use Digital Ocean's web 'Console'. 
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

Now your Droplet is running! Now you can continue with the Powerhouse tutorial or any next steps.

### DNS Configuration

#### Option A: Using DigitalOcean's Nameservers (Recommended)

1. **Add Your Domain to DigitalOcean:**
   - Go to "Networking" → "Domains"
   - Enter your domain name (e.g., `yourdomain.com`)
   - Click "Add Domain"

2. **Start with Updating Nameservers at Your Domain Registrar:**
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

   - **Connect Subdomain (A Record):**
     - **TYPE:** A
     - **HOSTNAME:** connect
     - **WILL DIRECT TO:** Your Droplet's IP
     - **TTL:** 3600

   - **Switchboard Subdomain (A Record):**
     - **TYPE:** A
     - **HOSTNAME:** switchboard
     - **WILL DIRECT TO:** Your Droplet's IP
     - **TTL:** 3600

#### Option B: Using Your Existing Nameservers (NS locked)

1. **Just Create DNS Records at Your Registrar:**
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

   - **Connect Subdomain (A Record):**
     - **TYPE:** A
     - **HOSTNAME:** connect
     - **VALUE:** Your Droplet's IP
     - **TTL:** 3600

   - **Switchboard Subdomain (A Record):**
     - **TYPE:** A
     - **HOSTNAME:** switchboard
     - **VALUE:** Your Droplet's IP
     - **TTL:** 3600

**Note:** DNS changes may take up to 48 hours to propagate globally.

### Verify Configuration

1. Use DNS lookup tools to verify your records:
   ```bash
   dig +short yourdomain.com
   dig +short www.yourdomain.com
   dig +short connect.yourdomain.com
   dig +short switchboard.yourdomain.com
   ```

2. All should return your Droplet's IP address

**Congratulations!** You have successfully set up your DigitalOcean Droplet and configured your domain. Your server is now ready to host your Powerhouse services.

</details>

<details>
<summary> **Setting up an EC2 instance and connecting your domain** </summary>

This tutorial will guide you through the process of assigning a static IP (Elastic IP) to your EC2 instance and configuring your domain to point to it.

**Current Date:** May 15, 2024

   - Make sure your region is set to eu-west-1 (Ireland)
   - Name your instance something like `cloud-server` or your project's name
   - Select Ubuntu 24.04 LTS
   - Architecture 64-bit (x86)
   - Scroll down to Instance type and select t2.medium (recommended)
      - 2 vCPUs and 4 GiB of memory are the recommended minimum specs
      - For larger projects or higher load, consider t2.large or t2.xlarge
   - Create a new key pair and save it in a secure location from which you can connect to your instance with the SSH client later.
   - Configure the security group to allow inbound traffic:
      - SSH (Port 22) from your IP address
      - HTTP (Port 80) from anywhere
      - HTTPS (Port 443) from anywhere
      - Custom TCP (Port 8442) for Connect
      - Custom TCP (Port 8441) for Switchboard
   - **Launch the instance**

   :::warning
   Make sure to keep your key pair file (.pem) secure and never share it. Without it, you won't be able to access your instance. Also, consider setting up AWS IAM roles and policies for better security management.
   :::


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

   - **Connect Subdomain (A Record):**
     - **TYPE:** A
     - **HOSTNAME:** connect
     - **VALUE:** Your Elastic IP
     - **TTL:** 3600

   - **Switchboard Subdomain (A Record):**
     - **TYPE:** A
     - **HOSTNAME:** switchboard
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

   - **Connect Subdomain (A Record):**
     - **TYPE:** A
     - **HOSTNAME:** connect
     - **VALUE:** Your Elastic IP
     - **TTL:** 3600

   - **Switchboard Subdomain (A Record):**
     - **TYPE:** A
     - **HOSTNAME:** switchboard
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
   dig +short connect.yourdomain.com
   dig +short switchboard.yourdomain.com
   ```

2. All should return your Elastic IP address

**Congratulations!** You have successfully set up your EC2 instance with a static IP and configured your domain. Your server is now ready to host your Powerhouse services.

</details>

## 1. Setting up a new cloud environment

The `install` script provides a streamlined way to install the Powerhouse CLI tool and all its necessary dependencies. This script handles the installation of Node.js 22, pnpm, and the Powerhouse CLI itself. It's designed to work across different Linux distributions, though it's optimized for Ubuntu and Debian-based systems. It also prepares your machine for running Powerhouse services. It handles everything from package installation to service configuration, making the setup process straightforward and automated. This script is particularly useful for setting up new servers or reconfiguring existing ones.

### Installation

1.  Run the setup script:
    ```bash
    curl -fsSL https://apps.powerhouse.io/install | bash # for macOS, Linux, and WSL
    ```

2.  After installation, source your shell configuration:
    ```bash
    source ~/.bashrc  # or source ~/.zshrc if using zsh
    ```

3.  Verify that the Powerhouse CLI is ready to be installed in the next step:
    ```bash
    ph --version
    ```
    You will see that `ph-cli` is not yet installed. This is expected, as it will be installed by the service setup command.

4. Create a project with `ph-init <projectname>`. After creation, move into the project with `cd <projectname>`. 
   Up next is the configurations of your services. 

### Service Configuration

Next, run `ph service setup` and follow the interactive prompts. This command installs the Powerhouse services (Connect and Switchboard) and guides you through their configuration.

:::info
**What does `ph service setup` do?**
The script takes care of all the necessary service configuration automatically.
It installs and configures **Nginx** as a reverse proxy, sets up SSL certificates, and configures the proxy settings for optimal performance.
It also installs **PM2** for process management and starts your services with the appropriate configuration based on your SSL choice.
The Nginx configuration includes optimizations for **WebSocket connections**, static file serving, and security headers.
PM2 is configured to automatically restart services if they crash and to start them on system boot.
:::

The setup command will prompt you for the following information:

#### Package Installation
During this phase, you can enter package names that you want to install. For example, you might want to `ph install @powerhousedao/todo-demo-package` or other Powerhouse packages. This step is crucial for adding the specific functionality you need. You can also press Enter to skip this step and install packages later using the `ph install` command.

#### Database Configuration
The script offers two options for database configuration:
*   **Option 1: Local Database** Sets up a local PostgreSQL database, which is ideal for development or small deployments. It automatically creates a database user with a secure random password and configures the database to accept local connections. This option is perfect for getting started quickly.
*   **Option 2: Remote Database** Allows you to connect to a remote PostgreSQL database by providing a connection URL in the format `postgres://user:password@host:port/db`. This is recommended for production environments.

#### SSL Configuration
For SSL configuration, you have two choices:
*   **Option 1: Let's Encrypt (Recommended for Production)** This option requires you to provide a base domain (e.g., `powerhouse.xyz`) and subdomains for your services. The script will automatically obtain and configure SSL certificates for your domains.
*   **Option 2: Self-signed Certificate** This is suitable for development or testing. It uses your machine's hostname and generates a self-signed certificate. Browsers will show security warnings with this option.

#### Domain Setup
You will be asked to enter your `connect` and `switchboard` subdomains to complete the setup. If you need more information, revisit the cloud provider setup sections at the beginning of this guide.

#### Security Features
Security is a top priority. The script implements automatic SSL certificate management, generates secure database passwords, and configures security headers in Nginx, and sets up proper proxy settings to support WebSocket connections securely.

## 2. Verifying the Setup

After the installation is complete, it's important to verify that everything is working correctly. You can check the status of your services using PM2, verify the Nginx configuration, and ensure your SSL certificates are properly installed. This step is crucial for identifying any potential issues before they affect your users.

1. Check service status of switchboard and connect:
```bash
ph service status
```
You can also use

```bash
ph service start | stop | restart 
```
to start | stop | restart switchboard and connect

2. View Nginx configuration:
```bash
sudo nginx -t
```

3. Check SSL certificates:
```bash
sudo certbot certificates  # if using Let's Encrypt
```

## 3. Accessing the Services

Once everything is set up, you can access your services through the configured domains.   
If you chose Let's Encrypt, your services will be available at their respective subdomains. With a self-signed certificate, you'll access the services through your machine's hostname with the appropriate base paths. The services are configured to use HTTPS by default, ensuring secure communication.

### With Let's Encrypt:
- Connect: `https://connect.yourdomain.com`
- Switchboard: `https://switchboard.yourdomain.com`

### With Self-signed Certificate:
- Connect: `https://your-hostname/connect`
- Switchboard: `https://your-hostname/switchboard`

## 4. Troubleshooting

When issues arise, there are several common problems you might encounter. 
- The "`ph`: command not found" error usually means you need to source your shell configuration file. 
- Nginx configuration errors can be investigated through the error logs, and service issues can be diagnosed using PM2 logs. 
- SSL certificate problems often relate to DNS settings or certificate paths. Understanding these common issues and their solutions will help you maintain a stable Powerhouse installation.

### Common Issues:
1. **"`ph`: command not found"**
   - Run `source ~/.bashrc` or restart your terminal
   - Verify that the `PNPM_HOME` environment variable is set correctly
   - Check if the `ph` binary exists in the `PNPM_HOME` directory

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

## 5. Maintenance

Regular maintenance is crucial for keeping your Powerhouse installation running smoothly. You can update services using the Powerhouse CLI, restart services through PM2, and monitor logs to ensure everything is functioning correctly. Regular maintenance helps prevent issues and ensures that your services are running with the latest security patches and features.

### Updating Services:
```bash
ph update <package-name>
```

### Restarting Services:
```bash
ph service restart
```

### Checking Service Status and Logs:
```bash
ph service status
```

## 6. Security Notes

Maintaining security is an ongoing process. It's essential to keep your database credentials secure and regularly update your SSL certificates. Regular monitoring of system logs helps identify potential security issues, and keeping your system and packages updated ensures you have the latest security patches. Consider implementing additional security measures such as firewall rules, intrusion detection systems, and regular security audits.

## 7. Backup

Regular backups are crucial for data safety. The database can be backed up using pg_dump, and your configuration files can be archived using tar. These backups should be stored securely and tested regularly to ensure they can be restored if needed. Consider implementing an automated backup schedule and storing backups in multiple locations for redundancy.

### Database Backup:
```bash
pg_dump -U powerhouse -d powerhouse > backup.sql
```

### Configuration Backup:
```bash
sudo tar -czf powerhouse-config.tar.gz /etc/powerhouse/
```

## 8. Best Practices

To get the most out of your Powerhouse installation, follow these best practices:

1. **Regular Updates**: Keep your system, packages, and services updated to the latest stable versions.
2. **Monitoring**: Set up monitoring for your services to detect issues early.
3. **Documentation**: Keep documentation of your configuration and any customizations.
4. **Testing**: Test your backup and restore procedures regularly.
5. **Security**: Regularly review and update your security measures.

## 9. Getting Help

If you encounter issues or need assistance, there are several resources available:

1. **Documentation**: Check the official Powerhouse documentation for detailed information.
2. **Community**: Join the Powerhouse community forums or chat channels.
3. **Support**: Contact Powerhouse support for professional assistance.
4. **GitHub**: Report issues or contribute to the project on GitHub. 
