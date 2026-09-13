const net = require("node:net");

function reservePort(host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function backendFilename(platform = process.platform) {
  return platform === "win32" ? "spikeforge-backend.exe" : "spikeforge-backend";
}

function isSafeExternalUrl(raw) {
  try {
    const protocol = new URL(raw).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

module.exports = { backendFilename, isSafeExternalUrl, reservePort };
