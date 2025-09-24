async function fetchMe() {
  const r = await fetch('/api/me');
  return r.json();
}

function el(id){ return document.getElementById(id); }

async function refresh() {
  const me = await fetchMe();
  const authDiv = el('auth');
  const game = el('game');
  if (!me.authenticated) {
    authDiv.innerHTML = `<a class="button" href="/auth/42/login">Se connecter avec 42</a>`;
    game.style.display = 'none';
    return;
  }
  authDiv.innerHTML = `<p>Connecté en tant que <strong>${me.login}</strong> <button id="logout">Logout</button></p>`;
  el('logout').onclick = async () => { await fetch('/auth/logout', {method:'POST'}); location.reload(); };
  game.style.display = 'block';
  el('info').innerHTML = `Entrez votre mot. <small class='note'>Seule votre première réponse sera prise en compte.</small>`;
  loadResults();
}

document.getElementById('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const word = document.getElementById('word').value.trim();
  const res = await fetch('/api/submit', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ word }) });
  const data = await res.json();
  const resultDiv = el('result');
  if (data.alreadySubmitted) {
    resultDiv.className = data.result.win ? 'win' : 'lose';
    resultDiv.textContent = `Déjà soumis: ${data.result.word} => ${data.result.win ? 'GAGNÉ' : 'PERDU'}`;
  } else {
    resultDiv.className = data.result.win ? 'win' : 'lose';
    resultDiv.textContent = data.result.win ? 'Bravo, mot correct!' : `Raté: ${data.result.word}`;
  }
  document.getElementById('word').disabled = true;
  document.querySelector('#form button').disabled = true;
  loadResults();
});

async function loadResults(){
  const r = await fetch('/api/results');
  const list = await r.json();
  const resultsDiv = el('results');
  resultsDiv.innerHTML = '<h3>Résultats</h3>' + list.map(r => `<div>${r.login} <span class="badge ${r.win ? 'win':'lose'}">${r.win ? 'win':'lose'}</span></div>`).join('');
}

refresh();
