# Public result portal deployment

The portal now reads and writes records through a server API backed by PostgreSQL. Once deployed, the public result page and result records are available across devices at the same public URL. The server, not a visitor's browser, enforces administrator authentication.

## Deploy on Render

1. Put this project in a private GitHub repository.
2. Sign in to Render, select **New > Blueprint**, and connect that repository.
3. Review the resources in `render.yaml`. The blueprint creates a web service and a persistent PostgreSQL database.
4. Enter a private `ADMIN_USERNAME` and a strong `ADMIN_PASSWORD` when Render requests the secret environment values. These replace the demo credentials and are never included in the site JavaScript.
5. Apply the blueprint and wait for the web service health check to pass.
6. Open the service's `https://...onrender.com` URL. Share that public URL with students; they can search results from any device.

The database uses Render's `basic-256mb` plan so results persist. The web service uses the free plan and may take a short time to wake up after inactivity. Render controls the public URL; connect a custom domain in its dashboard if desired.

## Required configuration for another Node/PostgreSQL host

Use Node.js 20 or newer and run `npm install` followed by `npm start`. Set:

- `DATABASE_URL`: PostgreSQL connection string for a persistent database.
- `ADMIN_USERNAME`: administrator username.
- `ADMIN_PASSWORD`: strong administrator password.
- `SESSION_SECRET`: a unique random secret of at least 32 characters.
- `NODE_ENV=production`: enables secure, HTTPS-only session cookies.
- `PORT`: optional; the hosting platform normally supplies this.
- `DATABASE_SSL=true`: optional for database hosts that require TLS.

The server initializes its tables on startup. Back up the PostgreSQL database according to the hosting provider's guidance. Do not deploy with the earlier demo login credentials.

## Local development

Install Node.js 20+ and PostgreSQL. Set the variables above in the terminal, using a development database and development-only credentials, then run `npm install` and `npm start`. Open `http://localhost:3000`.
