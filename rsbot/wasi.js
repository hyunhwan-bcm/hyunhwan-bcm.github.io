// A minimal WASI (preview 1) host for rsbot.wasm, in a browser worker or in Node.
//
// rsbot needs little from its host: environment variables, the clocks, random bytes (for the
// standard library's hash maps) and stdout/stderr. It gets PyBot's data through rsbot_load, not
// from files, so it has no file system: every file call answers "bad file descriptor", and any
// call not listed here answers "not supported".
(function (root) {
  "use strict";
  const SUCCESS = 0, EBADF = 8, ENOSYS = 52;

  class WasiExit extends Error {
    constructor(code) {
      super("rsbot exited with code " + code);
      this.code = code;
    }
  }

  // options: {env: {NAME: value}, print: (fd, line) => void}
  function makeWasi(options = {}) {
    const enc = new TextEncoder(), dec = new TextDecoder();
    const env = Object.entries(options.env || {}).map(([k, v]) => enc.encode(`${k}=${v}\0`));
    const print = options.print || ((fd, line) => (fd === 2 ? console.warn : console.log)("rsbot: " + line));
    const pending = { 1: "", 2: "" };
    let memory = null;
    const view = () => new DataView(memory.buffer);
    const bytes = () => new Uint8Array(memory.buffer);
    const nanos = (ms) => BigInt(Math.floor(ms)) * 1000000n + BigInt(Math.round((ms % 1) * 1e6));

    const calls = {
      environ_sizes_get(countPtr, sizePtr) {
        view().setUint32(countPtr, env.length, true);
        view().setUint32(sizePtr, env.reduce((n, e) => n + e.length, 0), true);
        return SUCCESS;
      },
      environ_get(environ, buf) {
        const v = view(), b = bytes();
        for (const e of env) {
          v.setUint32(environ, buf, true);
          environ += 4;
          b.set(e, buf);
          buf += e.length;
        }
        return SUCCESS;
      },
      args_sizes_get(countPtr, sizePtr) {
        view().setUint32(countPtr, 0, true);
        view().setUint32(sizePtr, 0, true);
        return SUCCESS;
      },
      args_get() {
        return SUCCESS;
      },
      clock_res_get(_id, resPtr) {
        view().setBigUint64(resPtr, 1000n, true);
        return SUCCESS;
      },
      clock_time_get(id, _precision, timePtr) {
        // 0 is the wall clock; the others (monotonic, CPU time) are read from the monotonic clock
        const ms = id === 0 ? performance.timeOrigin + performance.now() : performance.now();
        view().setBigUint64(timePtr, nanos(ms), true);
        return SUCCESS;
      },
      random_get(ptr, len) {
        const b = bytes();
        for (let i = 0; i < len; i += 65536) crypto.getRandomValues(b.subarray(ptr + i, ptr + Math.min(len, i + 65536)));
        return SUCCESS;
      },
      fd_write(fd, iovs, iovsLen, nwrittenPtr) {
        if (fd !== 1 && fd !== 2) return EBADF;
        const v = view(), b = bytes();
        let n = 0;
        for (let i = 0; i < iovsLen; i++) {
          const ptr = v.getUint32(iovs + 8 * i, true), len = v.getUint32(iovs + 8 * i + 4, true);
          pending[fd] += dec.decode(b.subarray(ptr, ptr + len), { stream: true });
          n += len;
        }
        let nl;
        while ((nl = pending[fd].indexOf("\n")) >= 0) {
          print(fd, pending[fd].slice(0, nl));
          pending[fd] = pending[fd].slice(nl + 1);
        }
        v.setUint32(nwrittenPtr, n, true);
        return SUCCESS;
      },
      fd_prestat_get() {
        return EBADF; // no preopened directories
      },
      fd_close() {
        return EBADF;
      },
      fd_seek() {
        return EBADF;
      },
      fd_read() {
        return EBADF;
      },
      fd_fdstat_get() {
        return EBADF;
      },
      fd_filestat_get() {
        return EBADF;
      },
      sched_yield() {
        return SUCCESS;
      },
      proc_exit(code) {
        throw new WasiExit(code);
      },
    };

    return {
      // The import object for this module: every WASI call it asks for.
      imports(module) {
        const out = {};
        for (const imp of WebAssembly.Module.imports(module)) {
          if (imp.module !== "wasi_snapshot_preview1" || imp.kind !== "function") continue;
          out[imp.name] = calls[imp.name] || (() => ENOSYS);
        }
        return { wasi_snapshot_preview1: out };
      },
      setMemory(m) {
        memory = m;
      },
    };
  }

  const api = { makeWasi, WasiExit };
  if (typeof module === "object" && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof self !== "undefined" ? self : globalThis);
