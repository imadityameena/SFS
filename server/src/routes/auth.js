// OAuth2 "Authorization Code" flow with GitHub, followed by issuing our own JWT.
//
// 1. Browser -> GET /api/auth/github           (we redirect to GitHub)
// 2. User approves on GitHub
// 3. GitHub -> GET /api/auth/github/callback?code=...&state=...
// 4. Server exchanges the code for an access token (server-to-server)
// 5. Server fetches the GitHub profile, creates/updates the user
// 6. Server signs a JWT and redirects to the React app with it
import crypto from 'node:crypto';
import express from 'express';
import { config, githubEnabled } from '../config.js';
import { db } from '../db.js';
import { signToken, requireAuth } from '../middleware/auth.js';

export const authRouter = express.Router();

// "state" protects against CSRF on the OAuth callback. We remember the
// values we handed out for 10 minutes.
const pendingStates = new Map();
const STATE_TTL_MS = 10 * 60 * 1000;

function newState() {
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, Date.now() + STATE_TTL_MS);
  return state;
}

function consumeState(state) {
  const expires = pendingStates.get(state);
  pendingStates.delete(state);
  return Boolean(expires && expires > Date.now());
}

// Tells the login page which sign-in options to show.
authRouter.get('/providers', (req, res) => {
  res.json({ github: githubEnabled, dev: config.allowDevLogin });
});

authRouter.get('/github', (req, res) => {
  if (!githubEnabled) return res.status(503).send('GitHub OAuth is not configured.');
  const params = new URLSearchParams({
    client_id: config.github.clientId,
    redirect_uri: config.github.callbackUrl,
    scope: 'read:user',
    state: newState(),
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

authRouter.get('/github/callback', async (req, res) => {
  const { code, state } = req.query;
  const fail = (msg) =>
    res.redirect(`${config.clientUrl}/#error=${encodeURIComponent(msg)}`);

  if (!code || !state || !consumeState(String(state))) {
    return fail('Login failed: invalid OAuth state.');
  }

  try {
    // Exchange the authorization code for an access token.
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.github.clientId,
        client_secret: config.github.clientSecret,
        code,
        redirect_uri: config.github.callbackUrl,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return fail('Login failed: no access token.');

    // Use the access token to read the user's GitHub profile.
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github+json',
      },
    });
    const profile = await userRes.json();
    if (!profile.id) return fail('Login failed: could not read profile.');

    const user = db.upsertUser({
      id: `github:${profile.id}`,
      name: profile.name || profile.login,
      avatar: profile.avatar_url,
    });

    // The JWT goes in the URL *fragment* (#), which browsers never send
    // to servers, so it does not end up in server logs.
    res.redirect(`${config.clientUrl}/#token=${signToken(user)}`);
  } catch (err) {
    console.error('OAuth error:', err);
    fail('Login failed: could not reach GitHub.');
  }
});

// Development-only login, so the app can be tested without OAuth setup.
authRouter.post('/dev-login', express.json(), (req, res) => {
  if (!config.allowDevLogin) return res.status(403).json({ error: 'Dev login disabled' });
  const username = String(req.body?.username || '').trim();
  if (!/^[a-zA-Z0-9_-]{3,30}$/.test(username)) {
    return res.status(400).json({ error: 'Username: 3-30 letters, numbers, - or _' });
  }
  const user = db.upsertUser({ id: `dev:${username}`, name: username, avatar: null });
  res.json({ token: signToken(user) });
});

authRouter.get('/me', requireAuth, (req, res) => {
  const user = db.getUser(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    id: user.id,
    name: user.name,
    avatar: user.avatar,
    hasKeys: Boolean(user.keys),
  });
});
