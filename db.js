// Firebase Realtime Database — REST API with Server-Sent Events
// Replaces localStorage shim. Data syncs across all devices in real time.

const _DB = 'https://tips-manager-25d5c-default-rtdb.firebaseio.com';

const _sources   = {};   // path → EventSource
const _listeners = {};   // path → [callback]

function _url(path) {
  return `${_DB}/${path}.json`;
}

function _fetchVal(path, cb, errCb) {
  fetch(_url(path))
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(data => cb({ val: () => data }))
    .catch(e => { if (errCb) errCb(e); });
}

function _notifyAll(path, data) {
  (_listeners[path] || []).forEach(cb => cb({ val: () => data }));
}

class _Ref {
  constructor(path) {
    this._p = path.replace(/^\/+|\/+$/g, '');
  }

  on(event, cb, errCb) {
    if (event !== 'value') return;

    if (!_listeners[this._p]) _listeners[this._p] = [];
    _listeners[this._p].push(cb);

    // If stream already open, just do one immediate read for new subscriber
    if (_sources[this._p]) {
      _fetchVal(this._p, cb, errCb);
      return;
    }

    // Open SSE stream — Firebase delivers current value as first 'put' event
    const p = this._p;
    const es = new EventSource(_url(p));
    _sources[p] = es;

    es.addEventListener('put', e => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.path === '/') {
          _notifyAll(p, msg.data);
        } else {
          // Sub-path change — re-fetch full node to stay consistent
          fetch(_url(p)).then(r => r.json()).then(d => _notifyAll(p, d)).catch(() => {});
        }
      } catch {}
    });

    es.addEventListener('patch', () => {
      fetch(_url(p)).then(r => r.json()).then(d => _notifyAll(p, d)).catch(() => {});
    });

    es.onerror = () => { if (errCb) errCb(); };
  }

  once(event, cb, errCb) {
    if (event !== 'value') return;
    _fetchVal(this._p, cb, errCb);
  }

  set(val) {
    return fetch(_url(this._p), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(val === undefined ? null : val)
    }).then(r => { if (!r.ok) return Promise.reject('write failed'); });
  }

  update(patch) {
    return fetch(_url(this._p), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    }).then(r => { if (!r.ok) return Promise.reject('update failed'); });
  }

  remove() { return this.set(null); }
}

const db = { ref: path => new _Ref(path) };
