const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const destination = path.resolve(
  process.argv[2] || "marketing/itch/dashboard-live.png",
);

async function waitForConnected(window) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const connected = await window.webContents.executeJavaScript(
      "Boolean(document.querySelector('.conn.ok'))",
      true,
    );
    if (connected) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("live dashboard did not connect before capture");
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1400,
    height: 875,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  try {
    await window.loadURL("https://dash.spikeforge.net/");
    await waitForConnected(window);
    await window.webContents.executeJavaScript(
      "Array.from(document.querySelectorAll('[role=tab]')).find((element) => element.textContent?.includes('Model & Data'))?.click()",
      true,
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    const image = await window.webContents.capturePage();
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, image.toPNG());
    console.log(destination);
  } finally {
    window.destroy();
    app.quit();
  }
});
