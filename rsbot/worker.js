// Runs rsbot.wasm off the page's main thread. It downloads the module and PyBot's data, loads
// them, and then answers one line at a time. One worker holds one conversation.
//
// In:  {type: "chat", text}  |  {type: "reset"}
// Out: {type: "progress", loaded, total}  |  {type: "status", text}
//      {type: "ready", ms, memoryMB}  |  {type: "reply", reply, module, ms, turn}  |  {type: "error", text}
importScripts("wasi.js");

const SEED = 0; // as rsbot_web and the recorded PyBot runs
const enc = new TextEncoder(), dec = new TextDecoder();
let ex = null;

const isGzip = (b) => b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;

async function download(url, onBytes) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status} ${r.statusText}`);
  const reader = r.body.getReader(), chunks = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    n += value.length;
    onBytes(value.length);
  }
  const out = new Uint8Array(n);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

async function gunzip(bytes) {
  if (!isGzip(bytes)) return bytes; // the server already decompressed it
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Write bytes into the module's memory, call fn(ptr, len), read the JSON it leaves.
function call(fn, bytes) {
  const ptr = ex.rsbot_alloc(bytes.length) >>> 0;
  new Uint8Array(ex.memory.buffer, ptr, bytes.length).set(bytes);
  const len = fn(ptr, bytes.length) >>> 0;
  return JSON.parse(dec.decode(new Uint8Array(ex.memory.buffer, ex.rsbot_out_ptr() >>> 0, len)));
}

const localOffset = () => -new Date().getTimezoneOffset();

async function boot() {
  const t0 = performance.now();
  const manifest = await (await fetch("files.json", { cache: "no-cache" })).json();
  const total = manifest.files["rsbot.wasm.gz"] + manifest.files["bundle.json.gz"];
  let loaded = 0, last = 0;
  const tick = (n) => {
    loaded += n;
    const now = performance.now();
    if (now - last > 100) {
      last = now;
      postMessage({ type: "progress", loaded, total });
    }
  };
  const v = encodeURIComponent(manifest.version);
  const [wasmGz, bundle] = await Promise.all([download(`rsbot.wasm.gz?v=${v}`, tick), download(`bundle.json.gz?v=${v}`, tick)]);
  postMessage({ type: "progress", loaded: total, total });
  postMessage({ type: "status", text: "Starting the bot" });
  let module;
  try {
    module = await WebAssembly.compile(await gunzip(wasmGz));
  } catch (e) {
    throw new Error(
      "this browser cannot run the bot (it needs WebAssembly exception handling: Chrome 95, Firefox 100, Safari 15.2 or newer). " + e.message
    );
  }
  const wasi = makeWasi();
  ex = (await WebAssembly.instantiate(module, wasi.imports(module))).exports;
  wasi.setMemory(ex.memory);
  ex._initialize?.();
  ex.rsbot_set_utc_offset(localOffset());
  postMessage({ type: "status", text: "Loading PyBot's data" });
  const r = call(ex.rsbot_load, bundle); // gzipped JSON; the module unpacks it
  if (!r.ok) throw new Error("could not load PyBot's data: " + r.error);
  ex.rsbot_reset(BigInt(SEED));
  postMessage({ type: "ready", ms: Math.round(performance.now() - t0), memoryMB: Math.round(ex.memory.buffer.byteLength / 2 ** 20) });
}

const booting = boot().catch((e) => {
  postMessage({ type: "error", text: String(e.message || e) });
  throw e;
});

onmessage = async (e) => {
  const msg = e.data;
  try {
    await booting;
    if (msg.type === "reset") {
      ex.rsbot_reset(BigInt(SEED));
    } else if (msg.type === "chat") {
      ex.rsbot_set_utc_offset(localOffset()); // the date follows the browser's clock and zone
      const r = call(ex.rsbot_turn, enc.encode(msg.text));
      postMessage({ type: "reply", reply: r.reply, module: r.module, ms: r.ms, turn: r.turn });
    }
  } catch (err) {
    // a trap (out of memory, say) leaves the module unusable; the page offers a reload
    postMessage({ type: "error", text: String(err.message || err) });
  }
};
