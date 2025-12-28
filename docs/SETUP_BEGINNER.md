# SETUP_BEGINNER.md

A complete beginner-friendly guide to setting up the VinAgent development environment. This is written in clear, simple English with step-by-step instructions so that anyone—including future you—can follow it without needing to remember anything technical.

This guide covers:

1. Installing all required tools
2. Setting up the repository
3. Creating your environment variables
4. Installing and running MySQL
5. Running the development server
6. Running tests
7. Common troubleshooting issues

---

## 1. Install Required Tools

Before anything else, you need a few tools installed on your computer.

### 1.1 Install Node.js

VinAgent uses Node.js for the backend API.

1. Go to: [https://nodejs.org](https://nodejs.org)
2. Download the **LTS (Long Term Support)** version.
3. Install it using the default options.
4. Restart your computer (optional but recommended).

To confirm it installed correctly, open a terminal and run:

```bash
node -v
npm -v
```

You should see version numbers.

---

### 1.2 Install Git

Git is used to clone and manage the repository.

* Windows: [https://git-scm.com/download/win](https://git-scm.com/download/win)
* macOS: [https://git-scm.com/download/mac](https://git-scm.com/download/mac)
* Linux (Debian/Ubuntu):

  ```bash
  sudo apt install git
  ```

Check installation:

```bash
git --version
```

---

### 1.3 Install MySQL (or Docker for MySQL)

VinAgent uses MySQL as its database.

You can install **MySQL directly**, or use **Docker** if you prefer containers.

#### Option A: Install MySQL directly (simple, beginner-friendly)

1. Visit: [https://dev.mysql.com/downloads/mysql/](https://dev.mysql.com/downloads/mysql/)
2. Download the Community Server edition.
3. During installation, set:

   * Root password → choose something simple but safe
4. Write down your MySQL root password.

Check installation:

```bash
mysql --version
```

#### Option B: Install Podman (optional but powerful)

If you want an easier-to-reset database:

1. Install Podman: [https://podman.io/getting-started/installation](https://podman.io/getting-started/installation)
2. After installing, run:

   ```bash
   podman run --name vinagent-mysql -e MYSQL_ROOT_PASSWORD=password -p 3306:3306 -d docker.io/library/mysql:8
   # OR
   docker run --name vinagent-mysql -e MYSQL_ROOT_PASSWORD=password -p 3306:3306 -d mysql:8
   ```

---

### 1.4 Install Firebase Tools

We use Firebase Authentication to manage users.

Install Firebase CLI:

```bash
npm install -g firebase-tools
```

Login:

```bash
firebase login
```

---

### 1.5 Install a Code Editor

Recommended: **VS Code**

Download: [https://code.visualstudio.com](https://code.visualstudio.com)

Also install these extensions:

* ESLint
* Prettier
* GitHub Copilot (optional)
* OpenAI Codex extension (when available)

---

## 2. Clone the VinAgent Repository

Choose a folder on your computer where you want the project to live.

In your terminal:

```bash
git clone <REPO_URL_GOES_HERE>
cd vinagent
```

Install project dependencies:

```bash
npm install
```

You now have the full project locally.

---

## 3. Set Up Environment Variables

The project uses a `.env` file to store secrets.

Create a copy of `.env.example`:

```bash
cp .env.example .env
```

Open `.env` in your editor, then fill in values:

### Required entries include:

* `DATABASE_HOST=localhost`
* `DATABASE_USER=root`
* `DATABASE_PASSWORD=<your_mysql_password>`
* `DATABASE_NAME=vinagent`
* `FIREBASE_PROJECT_ID=<your_project_id>`
* `OPENAI_API_KEY=<your_openai_key>`
* `TWILIO_ACCOUNT_SID=<optional_for_now>`
* `TWILIO_AUTH_TOKEN=<optional_for_now>`

If you're just starting out:

* Leave Twilio and Retell blank
* Only fill in MySQL and Firebase later when needed

### Security Warning: Test Auth Bypass

> [!CAUTION]
> **NEVER set `ALLOW_TEST_AUTH_BYPASS=true` in production!**
>
> This setting allows bypassing Firebase authentication using a mock token. It exists **only for local testing and CI environments**.
>
> **Safeguards in place:**
> - The application will **refuse to start** in `NODE_ENV=production` if this is enabled.
> - Even if somehow enabled, the middleware will **reject mock-token requests** in production and log a security alert.
> - All bypass usage is logged with `security_event` metrics for monitoring.
>
> **Correct usage:**
> - Set `ALLOW_TEST_AUTH_BYPASS=true` only in your local `.env` or CI test environment.
> - Never commit this value to version control.
> - Your production `.env` should not contain this variable at all.

---

## 4. Set Up the MySQL Database

Once MySQL is running, create the database:

```bash
mysql -u root -p -e "CREATE DATABASE vinagent;"
```

Now run Sequelize migrations (this will create tables):

```bash
npx sequelize db:migrate
```

If you get connection errors, check:

* Is MySQL running?
* Is your password correct?
* Does `.env` match your setup?

---

## 5. Running the Development Server

Start the server in development mode:

```bash
npm run dev
```

If successful, you should see something like:

```text
Server listening on port 3000
Database connected
```

To check that the backend works, open:

```
http://localhost:3000/health
```

You should see a simple JSON response.

---

## 6. Running the Test Suite

The project uses Jest for testing.

Run all tests:

```bash
npm test
```

Run a specific test file:

```bash
npm test -- src/tests/path/to/file.test.js
```

Run tests in watch mode:

```bash
npm run test:watch
```

If tests fail, read the message—Jest will show exactly where.

---

## 7. Common Troubleshooting

Here are the most common issues you may encounter:

### Problem: "ECONNREFUSED" when connecting to MySQL

Check:

* Is MySQL running?
* Is the port correct? (Default is 3306)
* Does `.env` match your password?

### Problem: "npx: command not found"

Your Node.js installation may be incomplete. Reinstall Node.

### Problem: Firebase errors

Run:

```bash
firebase login
firebase projects:list
```

Make sure your project ID matches `.env`.

### Problem: Tests failing unexpectedly

Try resetting the DB:

```bash
npx sequelize db:migrate:undo:all
npx sequelize db:migrate
```

### Problem: Port already in use

Stop the program using that port, or change the port in `.env`.

---

## 8. Next Steps After Setup

Once you have completed this setup and confirmed the server runs, you are ready to begin:

1. Using the **thin vertical slice** development approach
2. Running agentic coding prompts for individual components
3. Expanding the DB models
4. Integrating AI triage logic

This file will always remain your reference point for reinstalling or resetting the project.

---

## 9. Final Notes

* Keep this guide simple and readable.
* Update it anytime installation steps change.
* Treat this as the starting point for all new contributors and all agentic systems.

You can return to this document at any time with no prior context required.
