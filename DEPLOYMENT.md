# Deployment Guide for VPS (Docker)

This guide will help you deploy the indexer-backend application on a VPS using Docker.

## Prerequisites

- VPS with Docker and Docker Compose installed
- SSH access to your VPS
- Git installed on your VPS
- At least 1GB RAM recommended
- Supabase account with a database project
- Supabase database connection string
- Scrape.do API key

## Step-by-Step Deployment

### Step 1: Prepare Your VPS

SSH into your VPS:
```bash
ssh user@your-vps-ip
```

Verify Docker is installed:
```bash
docker --version
docker compose version
```

If Docker Compose is not installed:
```bash
# For Ubuntu/Debian
sudo apt update
sudo apt install docker-compose-plugin

# Or install standalone docker-compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### Step 2: Clone Your Repository

```bash
# Create application directory
mkdir -p ~/apps
cd ~/apps

# Clone your repository (replace with your git URL)
git clone <your-repository-url> indexer-backend
cd indexer-backend
```

**Alternative: If you don't have a git repository yet:**
```bash
# On your local machine, compress the project
cd "d:\New folder\indexer-backend"
tar -czf indexer-backend.tar.gz --exclude=node_modules --exclude=.git .

# Upload to VPS using SCP
scp indexer-backend.tar.gz user@your-vps-ip:~/apps/

# On VPS, extract
cd ~/apps
mkdir indexer-backend
cd indexer-backend
tar -xzf ../indexer-backend.tar.gz
```

### Step 3: Get Your Supabase Database Connection String

1. Go to your Supabase project dashboard
2. Navigate to **Settings** → **Database**
3. Under **Connection String**, select **URI** format
4. Copy the connection string (it will look like: `postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`)
5. Replace `[YOUR-PASSWORD]` with your actual database password

### Step 4: Configure Environment Variables

Create a `.env` file from the template:
```bash
cp .env.production .env
nano .env
```

Update the following values in `.env`:
```bash
# Add your Supabase database connection string
DATABASE_URL=postgresql://postgres:your-password@db.xxxxxxxxxxxxx.supabase.co:5432/postgres

# Set a strong Redis password (generate one: openssl rand -base64 48)
REDIS_PASSWORD=your_secure_redis_password_here

# Add your Scrape.do API key
SCRAPEDO_API_KEY=your_actual_scrapedo_api_key
```

Save and exit (Ctrl+X, then Y, then Enter).

**IMPORTANT: Security Note**
- The `.env` file with actual passwords is **NOT** committed to git (already in .gitignore)
- The `docker-compose.yml` file references `${REDIS_PASSWORD}` which pulls from your `.env` file
- Only the `.env.production` template is committed (with placeholder values)
- Never commit real passwords to your repository!

**For external access from Vercel (Next.js project):**

After deploying, you'll need to add this environment variable in your Vercel project settings:
```bash
REDIS_URL=redis://:your_secure_redis_password_here@your-vps-ip-or-domain:6379
```

**How to construct the REDIS_URL:**
1. Start with: `redis://:`
2. Add your Redis password (same as REDIS_PASSWORD in VPS `.env`)
3. Add `@` followed by your VPS IP or domain
4. Add `:6379` at the end

**Example:**
```bash
# If your VPS IP is 123.45.67.89 and password is xK9mP2nQ5vR8sT1w
REDIS_URL=redis://:xK9mP2nQ5vR8sT1w@123.45.67.89:6379

# Or with a domain:
REDIS_URL=redis://:xK9mP2nQ5vR8sT1w@indexer.yourdomain.com:6379
```

### Step 4: Build and Start the Services

Build the Docker images:
```bash
docker compose build
```

Start all services:
```bash
docker compose up -d
```

This will start:
- Redis (port 6379) - for job queues
- Worker service - processes URLs from the queue
- API service (port 3001) - stats SSE endpoint

Note: PostgreSQL is not included as you're using Supabase.

### Step 5: Run Database Migrations

Run Prisma migrations to set up the database schema in Supabase:
```bash
# Run migrations
docker compose exec worker npx prisma migrate deploy

# Or if you need to create a new migration
docker compose exec worker npx prisma migrate dev --name init
```

**Important**: This will create tables in your Supabase database. Make sure your Supabase connection string has write permissions.

### Step 6: Verify Deployment

Check if all containers are running:
```bash
docker compose ps
```

You should see all services as "Up" or "running".

Check logs:
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f worker
docker compose logs -f api
docker compose logs -f postgres
docker compose logs -f redis
```

Test the API:
```bash
curl http://localhost:3001
# Or from your local machine
curl http://your-vps-ip:3001
```

Test Redis connection (with password):
```bash
# From VPS
redis-cli -h localhost -p 6379 -a your_redis_password ping

# From your local machine (if port 6379 is open)
redis-cli -h your-vps-ip -p 6379 -a your_redis_password ping
```

### Step 7: Configure Firewall

If using UFW (Ubuntu Firewall):
```bash
# Allow SSH
sudo ufw allow 22

# Allow API port
sudo ufw allow 3001

# Allow Redis port (ONLY if accessing from external services like Vercel)
# ⚠️ WARNING: Only expose Redis if you need external access and have set a strong password!
sudo ufw allow 6379

# Enable firewall
sudo ufw enable
```

**Security Note**: Redis is now password-protected, which is essential for external access. For high-volume applications (500k+ operations), self-hosted Redis is cost-effective. To enhance security:

1. **IP Whitelisting (Recommended)**: Restrict Redis access to specific IPs
   ```bash
   # Allow only from specific IPs (replace with Vercel IPs or your app's IPs)
   sudo ufw delete allow 6379
   sudo ufw allow from YOUR_VERCEL_IP to any port 6379
   ```

2. **Strong Password**: Use a long, random password (50+ characters recommended)
   ```bash
   # Generate a secure password
   openssl rand -base64 48
   ```

3. **VPN Tunnel (Most Secure)**: For production, consider connecting Vercel to VPS via VPN (e.g., Tailscale, WireGuard)

**Note**: Managed Redis services like Upstash become expensive at high volumes. Self-hosted Redis is ideal for applications with 500k+ operations per project.

### Step 8: Set Up Nginx Reverse Proxy (Optional but Recommended)

Install Nginx:
```bash
sudo apt update
sudo apt install nginx
```

Create Nginx configuration:
```bash
sudo nano /etc/nginx/sites-available/indexer-backend
```

Add the following configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com;  # Replace with your domain or VPS IP

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # For SSE (Server-Sent Events)
        proxy_buffering off;
        proxy_read_timeout 86400;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/indexer-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Step 9: Set Up SSL with Let's Encrypt (Optional)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## Management Commands

### Start services:
```bash
docker compose up -d
```

### Stop services:
```bash
docker compose down
```

### Restart services:
```bash
docker compose restart
```

### View logs:
```bash
docker compose logs -f [service-name]
```

### Update application:
```bash
# Pull latest changes
git pull

# Rebuild and restart
docker compose down
docker compose build
docker compose up -d

# Run migrations if needed
docker compose exec worker npx prisma migrate deploy
```

### Access database:
```bash
# Connect to Supabase database using psql
docker compose exec worker sh
# Inside container, install psql if needed:
apk add postgresql-client
psql "$DATABASE_URL"

# Or directly from VPS (if psql installed):
psql "postgresql://postgres:your-password@db.xxxxxxxxxxxxx.supabase.co:5432/postgres"

# Or use Supabase dashboard SQL Editor at:
# https://app.supabase.com/project/[your-project-id]/sql
```

### Access Redis CLI:
```bash
# With password
docker compose exec redis redis-cli -a your_redis_password

# Or from VPS (if redis-cli installed)
redis-cli -h localhost -p 6379 -a your_redis_password

# Test from external machine (Vercel, local dev, etc.)
redis-cli -h your-vps-ip -p 6379 -a your_redis_password
```

### Execute commands in containers:
```bash
# Worker container
docker compose exec worker sh

# API container
docker compose exec api sh
```

## Backup and Restore

### Backup PostgreSQL (Supabase):
```bash
# Using pg_dump from your VPS (install postgresql-client first)
pg_dump "postgresql://postgres:your-password@db.xxxxxxxxxxxxx.supabase.co:5432/postgres" > backup_$(date +%Y%m%d).sql

# Or from inside worker container
docker compose exec worker sh
apk add postgresql-client
pg_dump "$DATABASE_URL" > /tmp/backup_$(date +%Y%m%d).sql
exit
docker cp indexer-worker:/tmp/backup_*.sql ./

# Or use Supabase built-in backups (Projects > Database > Backups)
```

### Restore PostgreSQL (Supabase):
```bash
# Using psql
psql "postgresql://postgres:your-password@db.xxxxxxxxxxxxx.supabase.co:5432/postgres" < backup_20260103.sql

# Or use Supabase dashboard to restore from their backups
```

### Backup Redis:
```bash
docker compose exec redis redis-cli SAVE
docker cp indexer-redis:/data/dump.rdb ./redis_backup_$(date +%Y%m%d).rdb
```

## Monitoring

### Check container health:
```bash
docker compose ps
docker stats
```

### Monitor logs in real-time:
```bash
docker compose logs -f --tail=100
```

### Check disk usage:
```bash
docker system df
```

### Clean up unused resources:
```bash
docker system prune -a
```

## Troubleshooting

### Container won't start:
```bash
# Check logs
docker compose logs [service-name]

# Check if ports are in use
sudo netstat -tulpn | grep -E ':(3001|5432|6379)'
```

### Database connection issues:
```bash
# Test Supabase connection from worker container
docker compose exec worker sh
apk add postgresql-client
psql "$DATABASE_URL" -c "SELECT version();"

# Check if DATABASE_URL is set correctly
docker compose exec worker env | grep DATABASE_URL

# Verify Supabase connection from VPS
nc -zv db.xxxxxxxxxxxxx.supabase.co 5432

# Check Supabase project status at https://status.supabase.com
```

### Reset everything (WARNING: Deletes all data):
```bash
docker compose down -v
docker compose up -d
docker compose exec worker npx prisma migrate deploy
```

## Security Recommendations

1. **Secure Supabase connection** - Keep your DATABASE_URL secret and use environment variables
2. **Use Supabase RLS** - Consider enabling Row Level Security policies in Supabase for additional protection
3. **Use firewall** - Only expose necessary ports (3001 for API)
4. **Set up SSL** - Use Let's Encrypt for HTTPS
5. **Regular updates** - Keep Docker images and system packages updated
6. **Backup regularly** - Use Supabase's automated daily backups (available in project settings)
7. **Monitor logs** - Check both application logs and Supabase logs
8. **Use secrets** - Don't commit `.env` to git (already in .gitignore)
9. **Supabase connection pooling** - For high-traffic apps, consider using Supabase's connection pooler (port 6543 with transaction mode)
10. **Redis IP whitelisting** - If exposing Redis externally, whitelist only trusted IPs to reduce attack surface
11. **Strong Redis password** - Generate a long random password (50+ characters) using `openssl rand -base64 48`
12. **Monitor Redis** - Set up monitoring for unusual connection patterns or high memory usage

## Production Checklist

- [ ] Supabase project created and database ready
- [ ] Supabase DATABASE_URL copied and added to `.env`
- [ ] Strong REDIS_PASSWORD generated and added to `.env`
- [ ] Configured `SCRAPEDO_API_KEY` in `.env`
- [ ] All containers running (check with `docker compose ps`)
- [ ] Database migrated (run `prisma migrate deploy`)
- [ ] Firewall configured (allow ports 3001 and 6379)
- [ ] Redis IP whitelisting configured (optional but recommended)
- [ ] REDIS_URL added to Vercel environment variables
- [ ] Nginx reverse proxy set up (optional)
- [ ] SSL certificate installed (optional)
- [ ] Supabase automated backups enabled
- [ ] Monitoring set up
- [ ] Logs being monitored

## Support

If you encounter issues:
1. Check logs: `docker compose logs -f`
2. Verify environment variables in `.env`
3. Ensure all prerequisites are met
4. Check if ports are available
5. Verify Docker and Docker Compose versions

## Auto-start on Boot

To ensure services start automatically on VPS reboot:

```bash
# Docker service should start on boot by default
sudo systemctl enable docker

# Add this to crontab
crontab -e

# Add this line:
@reboot cd /home/your-user/apps/indexer-backend && /usr/bin/docker compose up -d
```

Or create a systemd service:
```bash
sudo nano /etc/systemd/system/indexer-backend.service
```

Add:
```ini
[Unit]
Description=Indexer Backend
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/your-user/apps/indexer-backend
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

Enable:
```bash
sudo systemctl enable indexer-backend
sudo systemctl start indexer-backend
```
