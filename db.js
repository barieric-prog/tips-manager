// localStorage-backed database — drop-in Firebase Realtime Database API
// Syncs across same-browser tabs via 'storage' events; works fully offline.

function _lsGet(k) {
  try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch { return {}; }
}
function _lsSave(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

function _getPath(obj, parts) {
  return parts.reduce((o, k) => (o != null ? o[k] : null), obj) ?? null;
}
function _setPath(obj, parts, val) {
  if (!parts.length) return val;
  const out = Object.assign({}, obj || {});
  const k = parts[0];
  if (parts.length === 1) { if (val === null) delete out[k]; else out[k] = val; }
  else out[k] = _setPath(out[k], parts.slice(1), val);
  return out;
}

// Per-collection callbacks (for same-tab sync after writes)
const _subs = {};

// Cross-tab sync via Web Storage events
window.addEventListener('storage', e => {
  (_subs[e.key] || []).forEach(({ sub, cb }) => {
    const data = _lsGet(e.key);
    cb({ val: () => _getPath(data, sub ? sub.split('/') : []) });
  });
});

class _Ref {
  constructor(path) {
    const parts = path.split('/');
    this._c = parts[0];                    // collection (localStorage key)
    this._s = parts.slice(1).join('/');    // sub-path within collection
  }

  _snap() {
    const data = _lsGet(this._c);
    const parts = this._s ? this._s.split('/') : [];
    return { val: () => _getPath(data, parts) };
  }

  on(event, cb) {
    if (event !== 'value') return;
    if (!_subs[this._c]) _subs[this._c] = [];
    _subs[this._c].push({ sub: this._s, cb });
    cb(this._snap()); // immediate callback with current data
  }

  once(event, cb) {
    if (event !== 'value') return;
    cb(this._snap());
  }

  set(val) {
    const parts = this._s ? this._s.split('/') : [];
    const updated = _setPath(_lsGet(this._c), parts, val);
    _lsSave(this._c, updated);
    (_subs[this._c] || []).forEach(({ sub, cb }) =>
      cb({ val: () => _getPath(updated, sub ? sub.split('/') : []) })
    );
    return Promise.resolve();
  }

  update(patch) {
    const cur = this._snap().val() || {};
    return this.set(Object.assign({}, cur, patch));
  }

  remove() { return this.set(null); }
}

const db = { ref: path => new _Ref(path) };
