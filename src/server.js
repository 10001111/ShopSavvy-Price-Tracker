const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const dotenv = require("dotenv");
const { initDb } = require("./db");

dotenv.config();

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;

function renderPage(title, body) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 40px; max-width: 700px; }
      form { display: grid; gap: 12px; max-width: 360px; }
      input { padding: 8px; font-size: 14px; }
      button { padding: 8px 12px; font-size: 14px; }
      .muted { color: #666; }
      .error { color: #b00020; }
      .success { color: #0a7a2f; }
    </style>
  </head>
  <body>
    ${body}
  </body>
</html>`;
}

function createToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function setAuthCookie(res, token) {
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });
}

function clearAuthCookie(res) {
  res.clearCookie("token");
}

function authRequired(req, res, next) {
  const token = req.cookies.token;
  if (!token) {
    return res.redirect("/login");
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (error) {
    clearAuthCookie(res);
    return res.redirect("/login");
  }
}

function sendVerificationEmail(email, verificationLink) {
  console.log(`\n[Verification Email] To: ${email}`);
  console.log(`Verify your account: ${verificationLink}\n`);
}

async function start() {
  const db = await initDb();
  const app = express();

  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(cookieParser());

  app.get("/", (req, res) => {
    const hasToken = Boolean(req.cookies.token);
    res.send(renderPage(
      "ShopSavvy Price Tracker",
      `
        <h1>ShopSavvy Price Tracker</h1>
        <ul>
          <li><a href="/register">Register</a></li>
          <li><a href="/login">Login</a></li>
          <li><a href="/profile">Profile</a></li>
        </ul>
        ${hasToken ? `<form method="post" action="/logout"><button>Logout</button></form>` : ""}
      `
    ));
  });

  app.get("/register", (req, res) => {
    res.send(renderPage("Register", `
      <h1>Create Account</h1>
      <form method="post" action="/register">
        <label>Email</label>
        <input name="email" type="email" required />
        <label>Password</label>
        <input name="password" type="password" minlength="8" required />
        <button type="submit">Register</button>
      </form>
      <p class="muted">Already have an account? <a href="/login">Login</a></p>
    `));
  });

  app.post("/register", async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.send(renderPage("Register", `<p class="error">Email and password are required.</p>`));
    }

    const existing = await db.get("SELECT id, verified FROM users WHERE email = ?", email);
    if (existing) {
      return res.send(renderPage("Register", `
        <p class="error">Account already exists.</p>
        <p><a href="/login">Go to login</a></p>
      `));
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const createdAt = new Date().toISOString();

    await db.run(
      "INSERT INTO users (email, password_hash, verified, verification_token, created_at) VALUES (?, ?, 0, ?, ?)",
      email,
      passwordHash,
      verificationToken,
      createdAt
    );

    const verificationLink = `${APP_BASE_URL}/verify?token=${verificationToken}`;
    sendVerificationEmail(email, verificationLink);

    res.send(renderPage("Verify Email", `
      <h1>Verify your email</h1>
      <p>We sent a verification link to <strong>${email}</strong>.</p>
      <p class="muted">In development, the verification link is printed in the server console.</p>
    `));
  });

  app.get("/verify", async (req, res) => {
    const token = String(req.query.token || "");
    if (!token) {
      return res.send(renderPage("Verify Email", `<p class="error">Invalid verification token.</p>`));
    }

    const user = await db.get("SELECT id FROM users WHERE verification_token = ?", token);
    if (!user) {
      return res.send(renderPage("Verify Email", `<p class="error">Verification token not found.</p>`));
    }

    await db.run(
      "UPDATE users SET verified = 1, verification_token = NULL WHERE id = ?",
      user.id
    );

    res.send(renderPage("Verified", `
      <h1>Email verified</h1>
      <p>Your account is now verified.</p>
      <p><a href="/login">Continue to login</a></p>
    `));
  });

  app.get("/login", (req, res) => {
    res.send(renderPage("Login", `
      <h1>Login</h1>
      <form method="post" action="/login">
        <label>Email</label>
        <input name="email" type="email" required />
        <label>Password</label>
        <input name="password" type="password" required />
        <button type="submit">Login</button>
      </form>
      <p class="muted">New here? <a href="/register">Create an account</a></p>
    `));
  });

  app.post("/login", async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    const user = await db.get("SELECT * FROM users WHERE email = ?", email);
    if (!user) {
      return res.send(renderPage("Login", `<p class="error">Invalid email or password.</p>`));
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.send(renderPage("Login", `<p class="error">Invalid email or password.</p>`));
    }

    if (!user.verified) {
      return res.send(renderPage("Login", `
        <p class="error">Please verify your email before logging in.</p>
        <p class="muted">Check your email for the verification link.</p>
      `));
    }

    const token = createToken(user);
    setAuthCookie(res, token);
    return res.redirect("/profile");
  });

  app.post("/logout", (req, res) => {
    clearAuthCookie(res);
    res.redirect("/login");
  });

  app.get("/profile", authRequired, async (req, res) => {
    const user = await db.get("SELECT email FROM users WHERE id = ?", req.user.id);
    if (!user) {
      clearAuthCookie(res);
      return res.redirect("/login");
    }

    res.send(renderPage("Profile", `
      <h1>Profile</h1>
      <p>Email: <strong>${user.email}</strong></p>
      <form method="post" action="/logout">
        <button type="submit">Logout</button>
      </form>
    `));
  });

  app.get("/api/me", authRequired, async (req, res) => {
    const user = await db.get("SELECT email FROM users WHERE id = ?", req.user.id);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    res.json({ email: user.email });
  });

  app.listen(PORT, () => {
    console.log(`Server running at ${APP_BASE_URL}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
