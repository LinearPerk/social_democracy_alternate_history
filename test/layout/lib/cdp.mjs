'use strict';

const OPEN_TIMEOUT_MS = 10000;
const DEFAULT_SEND_TIMEOUT_MS = 30000;

// A minimal DevTools Protocol client over Node's built-in WebSocket: open a
// tab, send commands, subscribe to events. No dependency beyond fetch (to
// create the tab) and WebSocket, both global since Node 22.
export async function openPage(port) {
  const created = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  if (!created.ok) {
    throw new Error(`could not open a DevTools tab: ${created.status} ${created.statusText}`);
  }
  const target = await created.json();

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out opening the DevTools socket')), OPEN_TIMEOUT_MS);
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('DevTools socket error')); }, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  const listeners = new Set();

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined) {
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
    } else if (message.method) {
      for (const listener of listeners) listener(message.method, message.params);
    }
  });

  // A closed socket (Chrome crashed, was killed, etc.) should fail whatever
  // is still waiting on a response rather than hang it forever.
  ws.addEventListener('close', () => {
    for (const waiter of pending.values()) waiter.reject(new Error('DevTools socket closed'));
    pending.clear();
  });

  function send(method, params = {}, timeoutMs = DEFAULT_SEND_TIMEOUT_MS) {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`timed out waiting for a response to ${method}`));
      }, timeoutMs);
      pending.set(id, {
        resolve: (result) => { clearTimeout(timer); resolve(result); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  // Calls handler(params) whenever `method` fires. Returns a function that
  // stops listening.
  function on(method, handler) {
    const listener = (firedMethod, params) => {
      if (firedMethod === method) handler(params);
    };
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  async function close() {
    try {
      ws.close();
    } catch {
      // already closed
    }
  }

  return { send, on, close, targetId: target.id };
}
