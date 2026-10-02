// scripts/exec-compat.cjs
// Preload (NODE_OPTIONS=--require) para ambientes confinados (sandbox) onde o
// child_process.exec/spawn com stdio em pipe lança EPERM de forma SÍNCRONA.
// Este patch converte essa falha no comportamento normal do Node: o callback
// recebe o erro (em vez de uma exceção que derruba o processo), e o spawn tenta
// uma segunda vez com stdio:'ignore' antes de desistir.
// Uso: NODE_OPTIONS="--require <caminho>/scripts/exec-compat.cjs" node app.js
'use strict';

const cp = require('child_process');

function toError(e) {
  const err = new Error((e && e.message) || 'spawn failed');
  if (e) { err.code = e.code; err.errno = e.errno; err.syscall = e.syscall; }
  return err;
}

const noop = () => {};

function safeCallbackExec(orig) {
  return function patchedExec(...args) {
    try {
      return orig.apply(this, args);
    } catch (e) {
      const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
      if (!cb) throw e;
      const err = toError(e);
      process.nextTick(() => cb(err, '', ''));
      return {
        stdout: null, stderr: null, stdin: null, pid: -1, connected: false,
        on: noop, once: noop, emit: noop, kill: noop, ref: noop, unref: noop,
      };
    }
  };
}

function safeSpawn(orig) {
  return function patchedSpawn(cmd, args, opts) {
    try {
      return orig.call(this, cmd, args, opts);
    } catch (e) {
      const o2 = { ...(opts || {}), stdio: 'ignore' };
      try {
        return orig.call(this, cmd, args, o2);
      } catch (e2) {
        throw e2;
      }
    }
  };
}

cp.exec = safeCallbackExec(cp.exec);
cp.execFile = safeCallbackExec(cp.execFile);
cp.spawn = safeSpawn(cp.spawn);

if (typeof cp.fork === 'function') {
  cp.fork = safeSpawn(cp.fork);
}

module.exports = { execCompatLoaded: true };
