/** Real release archives and a recorder at Butler's remote boundary. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const windowsFiles = {
  "SpikeForge Desktop.exe": "desktop executable\n",
  "resources/backend/spikeforge-backend.exe": "backend executable\n",
  "resources/backend/_internal/kiwisolver/__init__.py": "runtime package\n",
  "resources/backend/_internal/kiwisolver/_cext.cp312-win_amd64.pyd":
    "runtime extension\n",
  "resources/backend/_internal/kiwisolver-1.5.1.dist-info/licenses/LICENSE":
    "kiwisolver license\n",
};

export function releaseArchives(cwd, version) {
  const artifacts = join(cwd, "artifacts");
  mkdirSync(artifacts);
  const result = spawnSync("python3", ["-c", `
import io, json, pathlib, sys, tarfile, zipfile
root, version, files = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
with zipfile.ZipFile(root / f"app-{version}-windows-x64.zip", "w") as archive:
    for name, content in json.loads(files).items():
        archive.writestr(name, content)
with tarfile.open(root / f"app-{version}-linux-x86_64.tar.gz", "w:gz") as archive:
    data = b"linux executable\\n"
    member = tarfile.TarInfo(f"app-{version}.AppImage")
    member.size, member.mode = len(data), 0o755
    archive.addfile(member, io.BytesIO(data))
`, artifacts, version, JSON.stringify(windowsFiles)], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return artifacts;
}

export function installButler(cwd) {
  const bin = join(cwd, "bin");
  mkdirSync(bin);
  const program = `#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
const entry = { args };
if (args[0] === "push") {
  const source = args.at(-2);
  entry.sourceType = fs.statSync(source).isDirectory() ? "directory" : "file";
  fs.appendFileSync(process.env.DESKTOP_PUBLISH_LOG,
    JSON.stringify(entry) + "\\n");
  if (args.at(-1).endsWith(":windows-x64")) {
    assert.equal(entry.sourceType, "directory",
      "Windows push must use extracted runtime files, not a ZIP path");
    for (const [name, content] of Object.entries(${JSON.stringify(windowsFiles)})) {
      assert.equal(fs.readFileSync(path.join(source, name), "utf8"), content);
    }
    assert.ok(!args.includes("--ignore"), "all Windows licenses must ship");
    if (process.env.DESKTOP_FAIL_WINDOWS === "1") process.exit(17);
    if (process.env.DESKTOP_SIGNAL_WINDOWS === "1") {
      process.kill(process.ppid, "SIGTERM");
    }
  }
} else {
  fs.appendFileSync(process.env.DESKTOP_PUBLISH_LOG,
    JSON.stringify(entry) + "\\n");
}
`;
  writeFileSync(join(bin, "butler"), program);
  chmodSync(join(bin, "butler"), 0o755);
  return bin;
}
