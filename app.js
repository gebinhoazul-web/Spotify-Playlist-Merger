/* Playlist Merger
 * Site 100% no navegador (sem servidor). Login via Spotify PKCE.
 * Endpoints seguem as mudanças da API do Spotify de fevereiro/2026
 * (/playlists/{id}/items, /me/playlists).
 */

const SPOTIFY_AUTH = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN = 'https://accounts.spotify.com/api/token';
const API = 'https://api.spotify.com/v1';
const SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
].join(' ');

// Quantas músicas enviar por requisição ao adicionar na playlist nova.
// O Spotify reduziu esse limite em 2026; se der erro, diminua este número.
const ADD_CHUNK = 10;

// Endereço da página (sem "index.html" no final). Precisa ser igual ao Redirect URI do app no Spotify.
const REDIRECT_URI = location.origin + location.pathname.replace(/index\.html$/, '');

const state = {
  playlists: [],
  selected: new Set(),
  tracks: [], // { uri, name, artists, album, sources:Set, keep, extra }
};

const $ = (sel) => document.querySelector(sel);

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k === 'checked') el.checked = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : String(kid));
  }
  return el;
}

function setStatus(sel, msg, type = '') {
  const el = $(sel);
  el.textContent = msg;
  el.className = 'status' + (type ? ' ' + type : '');
}

/* ---------- Autenticação (PKCE) ---------- */

function b64url(buf) {
  let s = '';
  new Uint8Array(buf).forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return b64url(a).slice(0, n);
}

async function login() {
  const clientId = $('#clientId').value.trim();
  if (!clientId) return setStatus('#setupStatus', 'Cole o Client ID do seu app Spotify.', 'error');
  localStorage.setItem('clientId', clientId);

  const verifier = randomString(64);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const st = randomString(16);
  sessionStorage.setItem('verifier', verifier);
  sessionStorage.setItem('state', st);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPES,
    state: st,
  });
  location.href = `${SPOTIFY_AUTH}?${params}`;
}

function saveToken(data) {
  const old = JSON.parse(localStorage.getItem('token') || '{}');
  localStorage.setItem('token', JSON.stringify({
    access: data.access_token,
    refresh: data.refresh_token || old.refresh,
    expires: Date.now() + data.expires_in * 1000 - 60000,
  }));
}

async function tokenRequest(body) {
  const res = await fetch(SPOTIFY_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  if (!res.ok) throw new Error('Falha ao autenticar no Spotify (' + res.status + ').');
  saveToken(await res.json());
}

async function handleCallback(params) {
  const code = params.get('code');
  const returnedState = params.get('state');
  history.replaceState({}, '', REDIRECT_URI);
  if (returnedState !== sessionStorage.getItem('state')) throw new Error('Login inválido (state diferente). Tente de novo.');
  await tokenRequest({
    client_id: localStorage.getItem('clientId'),
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: sessionStorage.getItem('verifier'),
  });
}

async function getToken() {
  const t = JSON.parse(localStorage.getItem('token') || 'null');
  if (!t) return null;
  if (Date.now() < t.expires) return t.access;
  if (!t.refresh) return null;
  try {
    await tokenRequest({
      client_id: localStorage.getItem('clientId'),
      grant_type: 'refresh_token',
      refresh_token: t.refresh,
    });
    return JSON.parse(localStorage.getItem('token')).access;
  } catch {
    return null;
  }
}

function logout() {
  localStorage.removeItem('token');
  location.href = REDIRECT_URI;
}

/* ---------- Chamadas à API ---------- */

async function api(pathOrUrl, opts = {}, attempt = 0) {
  const token = await getToken();
  if (!token) {
    logout();
    throw new Error('Sessão expirada. Entre de novo.');
  }
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : API + pathOrUrl;
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
  });

  if (res.status === 429 && attempt < 5) {
    const wait = (Number(res.headers.get('Retry-After')) || 2) * 1000;
    await new Promise((r) => setTimeout(r, wait));
    return api(pathOrUrl, opts, attempt + 1);
  }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error?.message || ''; } catch { /* ignora */ }
    const err = new Error(`Spotify respondeu ${res.status}${detail ? ': ' + detail : ''}`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

async function fetchAll(firstPath) {
  const out = [];
  let next = firstPath;
  while (next) {
    const page = await api(next);
    out.push(...(page.items || []));
    next = page.next;
  }
  return out;
}

/* ---------- Passo 1: playlists ---------- */

async function loadPlaylists() {
  setStatus('#playlistsStatus', 'Carregando suas playlists…');
  try {
    const me = await api('/me');
    $('#userInfo').textContent = 'Conectado como ' + (me.display_name || me.id);
    state.playlists = (await fetchAll('/me/playlists?limit=50')).filter(Boolean);
    renderPlaylists();
    setStatus('#playlistsStatus', state.playlists.length ? '' : 'Nenhuma playlist encontrada.');
  } catch (e) {
    setStatus('#playlistsStatus', e.message, 'error');
  }
}

function renderPlaylists() {
  const box = $('#playlists');
  box.replaceChildren(...state.playlists.map((p) => {
    const total = p.items?.total ?? p.tracks?.total;
    const cb = h('input', {
      type: 'checkbox',
      checked: state.selected.has(p.id),
      onchange: (e) => (e.target.checked ? state.selected.add(p.id) : state.selected.delete(p.id)),
    });
    return h('label', { class: 'row' }, cb,
      h('div', { class: 'info' },
        h('strong', {}, p.name || '(sem nome)'),
        h('span', { class: 'sub' }, `${p.owner?.display_name || ''}${total != null ? ' · ' + total + ' músicas' : ''}`)));
  }));
}

/* ---------- Passo 2: juntar e editar ---------- */

function toTrack(t, source, extra = false) {
  return {
    uri: t.uri,
    name: t.name,
    artists: (t.artists || []).map((a) => a.name).join(', '),
    album: t.album?.name || '',
    sources: new Set(source ? [source] : []),
    keep: true,
    extra,
  };
}

async function loadTracks() {
  const chosen = state.playlists.filter((p) => state.selected.has(p.id));
  if (!chosen.length) return setStatus('#playlistsStatus', 'Marque pelo menos uma playlist.', 'error');

  const btn = $('#loadTracksBtn');
  btn.disabled = true;
  const map = new Map();
  const problems = [];
  let skipped = 0;

  // mantém músicas extras já adicionadas
  for (const t of state.tracks.filter((x) => x.extra)) map.set(t.uri, t);

  for (const p of chosen) {
    setStatus('#playlistsStatus', `Lendo "${p.name}"…`);
    try {
      const rows = await fetchAll(`/playlists/${p.id}/items?limit=50`);
      let valid = 0;
      for (const row of rows) {
        // Desde 2026 o campo é "item"; "track" ficou como alias antigo (pode ser booleano).
        const t = row?.item && typeof row.item === 'object' ? row.item
          : row?.track && typeof row.track === 'object' ? row.track : null;
        if (!t || t.type !== 'track' || !t.uri || t.is_local || t.uri.startsWith('spotify:local')) {
          skipped++;
          continue;
        }
        valid++;
        if (map.has(t.uri)) map.get(t.uri).sources.add(p.name);
        else map.set(t.uri, toTrack(t, p.name));
      }
      const total = p.items?.total ?? p.tracks?.total;
      if (valid === 0 && total > 0) {
        problems.push(`"${p.name}": o Spotify não devolveu as músicas (pode ser uma playlist que não é sua).`);
      }
    } catch (e) {
      problems.push(`"${p.name}": ${e.message}`);
    }
  }

  state.tracks = [...map.values()];
  renderTracks();
  btn.disabled = false;

  const parts = [`${state.tracks.length} músicas únicas carregadas (duplicadas foram unificadas).`];
  if (skipped) parts.push(`${skipped} itens ignorados (arquivos locais, podcasts ou indisponíveis).`);
  setStatus('#playlistsStatus', parts.join(' '), 'ok');
  if (problems.length) setStatus('#tracksStatus', problems.join('\n'), 'error');
  else setStatus('#tracksStatus', '');
  $('#tracksStatus').style.whiteSpace = 'pre-line';
}

function updateCount() {
  const kept = state.tracks.filter((t) => t.keep).length;
  $('#count').textContent = state.tracks.length
    ? `${kept} de ${state.tracks.length} músicas serão adicionadas.`
    : '';
}

function visibleTracks() {
  const q = $('#filter').value.trim().toLowerCase();
  if (!q) return state.tracks;
  return state.tracks.filter((t) => `${t.name} ${t.artists} ${t.album}`.toLowerCase().includes(q));
}

function renderTracks() {
  const frag = document.createDocumentFragment();
  for (const t of visibleTracks()) {
    const cb = h('input', {
      type: 'checkbox',
      checked: t.keep,
      onchange: (e) => {
        t.keep = e.target.checked;
        row.classList.toggle('off', !t.keep);
        updateCount();
      },
    });
    const row = h('label', { class: 'row' + (t.keep ? '' : ' off') }, cb,
      h('div', { class: 'info' },
        h('strong', {}, t.name),
        h('span', { class: 'sub' }, `${t.artists}${t.album ? ' · ' + t.album : ''}`)),
      h('span', { class: 'tag' + (t.extra ? ' extra' : '') }, t.extra ? 'extra' : [...t.sources].join(', ')));
    frag.append(row);
  }
  $('#tracks').replaceChildren(frag);
  updateCount();
}

function setVisible(value) {
  for (const t of visibleTracks()) t.keep = value;
  renderTracks();
}

/* ---------- Passo 3: músicas extras ---------- */

async function searchTracks() {
  const q = $('#searchBox').value.trim();
  if (!q) return;
  setStatus('#searchStatus', 'Buscando…');
  try {
    const data = await api(`/search?q=${encodeURIComponent(q)}&type=track&limit=10`);
    const items = (data.tracks?.items || []).filter(Boolean);
    $('#results').replaceChildren(...items.map((t) => {
      const btn = h('button', {
        class: 'small',
        onclick: (e) => {
          e.preventDefault();
          const existing = state.tracks.find((x) => x.uri === t.uri);
          if (existing) existing.keep = true;
          else state.tracks.push(toTrack(t, null, true));
          btn.textContent = 'Adicionada ✓';
          btn.disabled = true;
          renderTracks();
        },
      }, '+ Adicionar');
      return h('div', { class: 'row' },
        h('div', { class: 'info' },
          h('strong', {}, t.name),
          h('span', { class: 'sub' }, `${(t.artists || []).map((a) => a.name).join(', ')} · ${t.album?.name || ''}`)),
        btn);
    }));
    setStatus('#searchStatus', items.length ? '' : 'Nada encontrado.');
  } catch (e) {
    setStatus('#searchStatus', e.message, 'error');
  }
}

/* ---------- Passo 4: criar ---------- */

async function createPlaylist() {
  const uris = state.tracks.filter((t) => t.keep).map((t) => t.uri);
  if (!uris.length) return setStatus('#createStatus', 'Não há músicas marcadas para adicionar.', 'error');
  const name = $('#newName').value.trim() || 'Minha playlist combinada';

  const btn = $('#createBtn');
  btn.disabled = true;
  try {
    setStatus('#createStatus', 'Criando a playlist…');
    const pl = await api('/me/playlists', {
      method: 'POST',
      body: JSON.stringify({
        name,
        public: $('#newPublic').checked,
        description: 'Criada com o Playlist Merger',
      }),
    });

    for (let i = 0; i < uris.length; i += ADD_CHUNK) {
      setStatus('#createStatus', `Adicionando músicas… ${Math.min(i + ADD_CHUNK, uris.length)} / ${uris.length}`);
      await api(`/playlists/${pl.id}/items`, {
        method: 'POST',
        body: JSON.stringify({ uris: uris.slice(i, i + ADD_CHUNK) }),
      });
    }

    const el = $('#createStatus');
    el.className = 'status ok';
    el.replaceChildren(`Pronto! ${uris.length} músicas adicionadas. `,
      h('a', { href: pl.external_urls?.spotify || '#', target: '_blank', rel: 'noopener' }, 'Abrir no Spotify'));
  } catch (e) {
    let msg = e.message;
    if (e.status === 403) {
      msg += '\nO Spotify bloqueou essa ação. Em apps em "Development Mode", confira se sua conta é Premium e se você está na lista de usuários do app (veja o README).';
    }
    setStatus('#createStatus', msg, 'error');
    $('#createStatus').style.whiteSpace = 'pre-line';
  } finally {
    btn.disabled = false;
  }
}

/* ---------- Início ---------- */

function showSetup() {
  $('#setup').classList.remove('hidden');
  $('#app').classList.add('hidden');
}

function showApp() {
  $('#setup').classList.add('hidden');
  $('#app').classList.remove('hidden');
}

async function init() {
  $('#redirect').textContent = REDIRECT_URI;
  $('#clientId').value = localStorage.getItem('clientId') || '';

  $('#copyRedirect').addEventListener('click', () => navigator.clipboard?.writeText(REDIRECT_URI));
  $('#loginBtn').addEventListener('click', login);
  $('#logoutBtn').addEventListener('click', logout);
  $('#loadTracksBtn').addEventListener('click', loadTracks);
  $('#filter').addEventListener('input', renderTracks);
  $('#checkAll').addEventListener('click', () => setVisible(true));
  $('#uncheckAll').addEventListener('click', () => setVisible(false));
  $('#searchBtn').addEventListener('click', searchTracks);
  $('#searchBox').addEventListener('keydown', (e) => { if (e.key === 'Enter') searchTracks(); });
  $('#createBtn').addEventListener('click', createPlaylist);

  const params = new URLSearchParams(location.search);
  try {
    if (params.get('error')) {
      history.replaceState({}, '', REDIRECT_URI);
      throw new Error('O Spotify recusou o login: ' + params.get('error'));
    }
    if (params.get('code')) await handleCallback(params);
  } catch (e) {
    showSetup();
    return setStatus('#setupStatus', e.message, 'error');
  }

  if (await getToken()) {
    showApp();
    loadPlaylists();
  } else {
    showSetup();
  }
}

init();
