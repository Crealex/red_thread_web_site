# Red Thread 42 OAuth

Petite application web utilisant l'OAuth2 de 42 pour authentifier un utilisateur, lui laisser entrer UN mot (seule la première réponse est prise en compte) et indiquer s'il a deviné le mot secret `babelfish`.

## Structure
```
final/
  server/index.js        Backend Express + routes OAuth et API
  web/                   Frontend statique (HTML/CSS/JS)
  data/results.json      Fichier JSON persisté (créé après la première soumission)
  package.json
  .env.example
```

## Variables d'environnement
Copiez `.env.example` vers `.env` et remplissez :
```
FT_CLIENT_ID=...
FT_CLIENT_SECRET=...
BASE_URL=http://localhost:3000
SESSION_SECRET=une_chaine
FT_CALLBACK_URL=http://localhost:3000/auth/42/callback
DEBUG_OAUTH=1
```
`BASE_URL` doit correspondre à l'URL enregistrée comme redirect URI côté 42 (ajouter `/auth/42/callback`).

## Lancer en local
```bash
npm install
cp .env.example .env # puis éditez .env
npm run dev
```
Ouvrez http://localhost:3000

## Logiciel
- Auth via 42 -> récupère `login`
- POST /api/submit avec `{ word }`
- Première soumission par login figée : renvoie `alreadySubmitted: true` si on tente à nouveau.
- Résultats accessibles via `/api/results` (liste `[{ login, win }]`).

## Sécurité / Notes
- Session gérée via cookie signé (cookie-session).
- Pas de rate limit (peut être ajouté facilement).
- Le mot secret est en clair dans le code; pour changer utilisez la constante `TARGET_WORD` dans `server/index.js`.

## Prochaines améliorations possibles
- Ajouter un bouton admin pour exporter le JSON.
- Ajouter un compteur de participations.
- Protéger `/api/results` si nécessaire.
- Ajouter un simple hash du mot saisi pour ne pas stocker la valeur brute.

## Dépannage OAuth ("Client authentication failed")
Si vous voyez `Client authentication failed due to unknown client, no client authentication included, or unsupported authentication method` :

1. Vérifiez que `FT_CLIENT_ID` et `FT_CLIENT_SECRET` sont corrects (copier/coller sans espaces).
2. Vérifiez que la Redirect URI dans le dashboard 42 correspond EXACTEMENT à `FT_CALLBACK_URL` (sans slash final supplémentaire, bon protocole http/https).
3. `FT_CALLBACK_URL` doit commencer par `BASE_URL` (même host/port). Si vous déployez : changer les deux.
4. Le POST token est envoyé en `application/x-www-form-urlencoded` (requis par 42 / OAuth 2). N'ajustez pas le header.
5. Activez `DEBUG_OAUTH=1` pour afficher l'URL d'autorisation et la valeur effective de callback au démarrage.
6. Regénérez un secret côté 42 si le doute persiste.

Exemple de `.env` local :
```
FT_CLIENT_ID=uid_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
FT_CLIENT_SECRET=secret_xxxxxxxxxxxxxxxxxxxxxxxxx
BASE_URL=http://localhost:3000
SESSION_SECRET=change_me_dev
```
