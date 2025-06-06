import { rm, mkdir, cp } from "fs/promises";
import { join } from "path";

const BROWSERS = ["chrome", "firefox"];

async function build(browser) {
  const distPath = `dist/${browser}`;
  const manifestPath = getManifestPath(browser);

  await rm(distPath, { recursive: true, force: true });
  await mkdir(distPath, { recursive: true });

  // Copy source files
  await cp("src", distPath, { recursive: true });

  // Copy icons
  await cp("icons", join(distPath, "icons"), { recursive: true });

  // Copy correct manifest
  await cp(manifestPath, join(distPath, "manifest.json"));
}

const getManifestPath = (browser) => browser === "chrome" ? "manifests/manifest.v3.json" : "manifests/manifest.v2.json";

await Promise.all(BROWSERS.map(build));
