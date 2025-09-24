import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import cookieSession from 'cookie-session';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const FT_CLIENT_ID = process.env.FT_CLIENT_ID;
const FT_CLIENT_SECRET = process.env.FT_CLIENT_SECRET;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
// Valeur brute depuis l'env (peut contenir espaces accidentels)
const RAW_FT_CALLBACK = process.env.FT_CALLBACK_URL;
// Permet de surcharger l'URL exacte enregistrée côté 42 si besoin (sans trim automatique pour éviter de changer silencieusement)
const CALLBACK_URL = RAW_FT_CALLBACK ? RAW_FT_CALLBACK : `${BASE_URL}/auth/42/callback`;

// Validation simple de cohérence BASE_URL / CALLBACK_URL
try {
  const b = new URL(BASE_URL);
  const c = new URL(CALLBACK_URL);
  if (b.host !== c.host) {
    console.warn('[OAuth42][WARN] Host différent entre BASE_URL ('+b.host+') et FT_CALLBACK_URL ('+c.host+').');
  }
  if (b.protocol !== c.protocol) {
    console.warn('[OAuth42][WARN] Protocole différent entre BASE_URL ('+b.protocol+') et FT_CALLBACK_URL ('+c.protocol+').');
  }
  if (!c.pathname.endsWith('/auth/42/callback')) {
    console.warn('[OAuth42][WARN] Le chemin de FT_CALLBACK_URL ne se termine pas par /auth/42/callback :', c.pathname);
  }
  if (/authorize\?/.test(CALLBACK_URL)) {
    console.error('[OAuth42][ERREUR] FT_CALLBACK_URL contient encore des paramètres d\'autorisation. Corrigez-le en simple URL de callback locale.');
  }
} catch (e) {
  console.warn('[OAuth42][WARN] Impossible de parser BASE_URL ou FT_CALLBACK_URL:', e.message);
}
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev_secret';
const DATA_FILE = path.join(__dirname, '..', 'data', 'results.json');
const TARGET_WORD = 'babelfish';

if (!FT_CLIENT_ID || !FT_CLIENT_SECRET) {
  console.error('Missing 42 OAuth credentials. Set FT_CLIENT_ID and FT_CLIENT_SECRET in .env');
}

app.use(express.json());
app.use(cookieSession({
  name: 'session',
  secret: SESSION_SECRET,
  maxAge: 1000 * 60 * 60 * 6, // 6h
  sameSite: 'lax'
}));

app.use(express.static(path.join(__dirname, '..', 'web')));

async function loadResults() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') return { users: {} };
    throw e;
  }
}

async function saveResults(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

app.get('/auth/42/login', (req, res) => {
  // URL exacte utilisée : doit matcher côté dashboard 42
  const redirect_uri = encodeURIComponent(CALLBACK_URL);
  const scope = encodeURIComponent('public');
  const state = Math.random().toString(36).slice(2);
  req.session.state = state;
  const url = `https://api.intra.42.fr/oauth/authorize?client_id=${FT_CLIENT_ID}&redirect_uri=${redirect_uri}&response_type=code&scope=${scope}&state=${state}`;
  if (process.env.DEBUG_OAUTH) {
    console.log('[OAuth42] Authorize URL =', url);
    console.log('[OAuth42] Raw CALLBACK_URL string / length =', JSON.stringify(CALLBACK_URL), CALLBACK_URL.length);
    // Affiche les codes caractères pour détecter espaces invisibles
    console.log('[OAuth42] CALLBACK_URL char codes =', CALLBACK_URL.split('').map(c=>c.charCodeAt(0)));
  }
  res.redirect(url);
});

app.get('/auth/42/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state || state !== req.session.state) {
    return res.status(400).send('Invalid state');
  }
  try {
    // Le endpoint OAuth token 42 attend du x-www-form-urlencoded (RFC 6749)
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: FT_CLIENT_ID,
      client_secret: FT_CLIENT_SECRET,
      code: code.toString(),
      redirect_uri: CALLBACK_URL
    }).toString();

    const tokenResp = await fetch('https://api.intra.42.fr/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody
    });

    let tokenData;
    if (!tokenResp.ok) {
      const errTxt = await tokenResp.text();
      console.error('42 token exchange failed', tokenResp.status, errTxt);
      return res.status(500).send('Token exchange failed');
    } else {
      tokenData = await tokenResp.json();
    }
    const userResp = await fetch('https://api.intra.42.fr/v2/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    if (!userResp.ok) {
      return res.status(500).send('User fetch failed');
    }
    const user = await userResp.json();
    req.session.user = { login: user.login };
    res.redirect('/');
  } catch (e) {
    console.error(e);
    res.status(500).send('OAuth failed');
  }
});

app.get('/api/me', (req, res) => {
  if (!req.session.user) return res.json({ authenticated: false });
  res.json({ authenticated: true, login: req.session.user.login });
});

app.post('/api/submit', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  const { word } = req.body || {};
  if (typeof word !== 'string') return res.status(400).json({ error: 'Invalid word' });
  const data = await loadResults();
  const login = req.session.user.login;
  if (data.users[login]) {
    return res.status(200).json({ alreadySubmitted: true, result: data.users[login] });
  }
  const win = word.trim().toLowerCase() === TARGET_WORD;
  data.users[login] = { win, word: word.trim(), at: new Date().toISOString() };
  await saveResults(data);
  res.json({ alreadySubmitted: false, result: data.users[login] });
});

app.get('/api/results', async (req, res) => {
  const data = await loadResults();
  const summary = Object.entries(data.users).map(([login, v]) => ({ login, win: v.win }));
  res.json(summary);
});

app.post('/auth/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'web', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
  console.log(`[OAuth42] BASE_URL=${BASE_URL}`);
  console.log(`[OAuth42] CALLBACK_URL=${CALLBACK_URL}`);
  if (process.env.DEBUG_OAUTH) {
    if (CALLBACK_URL !== CALLBACK_URL.trim()) {
      console.warn('[OAuth42][WARN] CALLBACK_URL contient probablement des espaces de début/fin.');
    }
    if (/\s/.test(CALLBACK_URL)) {
      console.warn('[OAuth42][WARN] CALLBACK_URL contient des espaces internes.');
    }
    if (/api\.intra\.42\.fr\/oauth\/authorize/.test(CALLBACK_URL)) {
      console.error('[OAuth42][ERREUR] FT_CALLBACK_URL pointe vers l\'endpoint d\'autorisation 42. Il doit pointer vers VOTRE application, ex: https://votre-domaine/auth/42/callback');
    }
  }
});

// Endpoint de debug (ne retourne rien de sensible) – à désactiver en prod si inutile
if (process.env.DEBUG_OAUTH) {
  app.get('/__debug_oauth', (req,res)=>{
    res.json({
      BASE_URL,
      CALLBACK_URL,
      CALLBACK_URL_length: CALLBACK_URL.length,
      encoded: encodeURIComponent(CALLBACK_URL),
      hasTrailingSlash: CALLBACK_URL.endsWith('/'),
      hasWhitespace: /\s/.test(CALLBACK_URL)
    });
  });
  app.get('/__debug_oauth_config', (req,res)=>{
    res.json({
      client_id_prefix: FT_CLIENT_ID ? FT_CLIENT_ID.slice(0, 14) : null,
      client_id_length: FT_CLIENT_ID ? FT_CLIENT_ID.length : 0,
      has_client_id_u_prefix: FT_CLIENT_ID ? FT_CLIENT_ID.startsWith('u-') : false,
      callback_url: CALLBACK_URL,
      expects_callback: `${BASE_URL}/auth/42/callback`,
      callback_matches_expected: CALLBACK_URL === `${BASE_URL}/auth/42/callback`
    });
  });
}
