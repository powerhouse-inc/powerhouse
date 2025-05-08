# Powerhouse Setup Guide

## Introduction
Powerhouse is a powerful platform that helps you manage and deploy your applications efficiently. This guide will walk you through the process of setting up both the Powerhouse CLI and configuring your machine to run Powerhouse services. Whether you're setting up a development environment or preparing for production deployment, this guide provides all the necessary steps and considerations.

## Prerequisites
Before you begin, ensure you have a Linux-based system (Ubuntu or Debian recommended), sudo privileges, and a stable internet connection. These are essential for the installation and configuration process. The system should have at least 1GB of RAM and 10GB of free disk space for optimal performance. While these are minimum requirements, more resources will provide better performance, especially when running multiple services.

## 1. Installing Powerhouse CLI

The `install-tools.sh` script provides a streamlined way to install the Powerhouse CLI tool and all its necessary dependencies. This script handles the installation of Node.js, pnpm, and the Powerhouse CLI itself. It's designed to work across different Linux distributions, though it's optimized for Ubuntu and Debian-based systems.

### Installation Steps:
1. Download the setup script:
```bash
curl -O https://raw.githubusercontent.com/your-repo/powerhouse/scripts/install-tools.sh
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
   - `latest`: Latest stable version - Recommended for production environments
   - Press Enter for latest version

5. After installation, source your shell configuration:
```bash
source ~/.bashrc  # or source ~/.zshrc if using zsh
```

6. Verify the installation:
```bash
ph version
```

## 2. Configuring Your Machine

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

#### Package Installation
During the package installation phase, you'll be prompted to enter package names that you want to install. For example, you might want to install `@sky-ph/atlas` or other Powerhouse packages. This step is crucial for adding the specific functionality you need to your Powerhouse installation. You can press Enter to skip this step if you don't need to install any packages immediately, but you can always install packages later using the `ph install` command.

#### Database Configuration
The script offers two options for database configuration. The first option sets up a local PostgreSQL database, which is ideal for development or small deployments. It automatically creates a database user with a secure random password and configures the database to accept local connections. This option is perfect for getting started quickly or for development environments. The second option allows you to connect to a remote PostgreSQL database by providing a connection URL in the format `postgres://user:password@host:port/db`. This is recommended for production environments where you might want to use a managed database service or a dedicated database server.

#### SSL Configuration
For SSL configuration, you have two choices. The Let's Encrypt option is recommended for production environments. It requires you to provide a base domain (like `powerhouse.xyz`) and optional subdomains for your services. The script will automatically obtain and configure SSL certificates for your domains, ensuring secure communication between your services and clients. The self-signed certificate option is suitable for development or testing environments. It uses your machine's hostname and generates a self-signed certificate, configuring the services with appropriate base paths. While this option is convenient for development, browsers will show security warnings, which is why it's not recommended for production use.

### Service Configuration

The script takes care of all the necessary service configuration automatically. It installs and configures Nginx as a reverse proxy, sets up SSL certificates, and configures the proxy settings for optimal performance. It also installs PM2 for process management and starts your services with the appropriate configuration based on your SSL choice. The Nginx configuration includes optimizations for WebSocket connections, static file serving, and security headers. PM2 is configured to automatically restart services if they crash and to start them on system boot.

### Security Features
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

When issues arise, there are several common problems you might encounter. The "ph: command not found" error usually means you need to source your shell configuration file. Nginx configuration errors can be investigated through the error logs, and service issues can be diagnosed using PM2 logs. SSL certificate problems often relate to DNS settings or certificate paths. Understanding these common issues and their solutions will help you maintain a stable Powerhouse installation.

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