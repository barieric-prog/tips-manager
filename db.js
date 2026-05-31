// GitHub-backed Realtime Database — Firebase-compatible API
// Data stored in: barieric-prog/tips-manager-data (private repo)

const _GH = {
  get token() { return atob('Z2hvX1pIUFkyME80YWFEYkJuRDNBaGZteXhXblhiOXhwdDBLbHBQaA=='); },
  repo:  'barieric-prog/tips-manager-data',
  base:  'https://api.github.com/repos/barieric-prog/tips-manager-data/contents/',
  get headers() {
    return {
      Authorization: 'token ' + this.token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    };
  }
};

// Per-collection state: { data, sha, listeners[], loaded, loading }
const _state = {};

function _col(name) {
  return _state[name] || (_state[name] = { data: {}, sha: null, listeners: [], loaded: false, loading: false });
}

function _b64dec(s) {
  try {
    return decodeURIComponent(
      atob(s.replace(/\n/g, '')).split('').map(c =>
        '%' + c.charCodeAt(0).toString(16).padStart(2, '0')
      ).join('')
    );
  } catch { return '{}'; }
}

function _b64enc(s) {
  return btoa(unescape(encodeURIComponent(s)));
}

function _getPath(obj, parts) {
  return parts.reduce((o, k) => (o != null ? o[k] : null), obj) ?? null;
}

function _setPath(obj, parts, val) {
  if (parts.length === 0) return val;
  const out = Object.assign({}, obj);
  const k = parts[0];
  if (parts.length === 1) {
    if (val === null) delete out[k];
    else out[k] = val;
  } else {
    out[k] = _setPath(out[k] || {}, parts.slice(1), val);
  }
  return out;
}

async function _fetch(name) {
  try {
    const r = await fetch(_GH.base + name + '.json', { headers: _GH.headers });
    if (!r.ok) return;
    const j = await r.json();
    const c = _col(name);
    c.data = JSON.parse(_b64dec(j.content));
    c.sha  = j.sha;
    c.loaded = true;
  } catch (e) { console.warn('db read error', name, e); }
}

async function _write(name) {
  const c = _col(name);
  const content = _b64enc(JSON.stringify(c.data));
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const body = JSON.stringify({
        message: 'update ' + name,
        content,
        ...(c.sha ? { sha: c.sha } : {})
      });
      const r = await fetch(_GH.base + name + '.json', {
        method: 'PUT', headers: _GH.headers, body
      });
      const j = await r.json();
      if (r.ok) { c.sha = j.content.sha; return; }
      if (r.status === 409 || r.status === 422) {
        await _fetch(name); // refresh SHA and retry
      } else {
        throw new Error('HTTP ' + r.status + ': ' + JSON.stringify(j));
      }
    } catch(e) {
      if (attempt === 2) throw e;
    }
  }
}

function _notify(name) {
  const c = _col(name);
  c.listeners.forEach(({ subpath, cb }) => {
    const parts = subpath ? subpath.split('/') : [];
    cb({ val: () => _getPath(c.data, parts) });
  });
}

class _Ref {
  constructor(path) {
    const parts = path.split('/');
    this._name = parts[0];
    this._sub  = parts.slice(1).join('/');
  }

  on(event, cb, errCb) {
    if (event !== 'value') return;
    const c = _col(this._name);
    c.listeners.push({ subpath: this._sub, cb });

    if (c.loaded) {
      const parts = this._sub ? this._sub.split('/') : [];
      cb({ val: () => _getPath(c.data, parts) });
    } else if (!c.loading) {
      c.loading = true;
      _fetch(this._name).then(() => {
        c.loading = false;
        _notify(this._name);
      }).catch(e => { c.loading = false; errCb && errCb(e); });
    }
  }

  once(event, cb, errCb) {
    if (event !== 'value') return;
    _fetch(this._name).then(() => {
      const parts = this._sub ? this._sub.split('/') : [];
      cb({ val: () => _getPath(_col(this._name).data, parts) });
    }).catch(e => errCb && errCb(e));
  }

  async set(val) {
    const c = _col(this._name);
    const parts = this._sub ? this._sub.split('/') : [];
    c.data = _setPath(c.data, parts, val);
    await _write(this._name);
    _notify(this._name);
  }

  async update(val) {
    const c = _col(this._name);
    const parts = this._sub ? this._sub.split('/') : [];
    const cur = _getPath(c.data, parts) || {};
    c.data = _setPath(c.data, parts, Object.assign({}, cur, val));
    await _write(this._name);
    _notify(this._name);
  }

  async remove() { return this.set(null); }
}

// Public API — mirrors firebase.database()
const db = { ref: path => new _Ref(path) };

// Periodic background sync (30 s) — keeps all loaded collections fresh
setInterval(() => {
  Object.keys(_state).filter(n => _state[n].loaded).forEach(n => {
    _fetch(n).then(() => _notify(n)).catch(() => {});
  });
}, 30000);
