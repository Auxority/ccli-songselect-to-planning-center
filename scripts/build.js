import { rm, mkdir, cp } from "fs/promises";
import { join } from "path";
import { createWriteStream } from "fs";
import archiver from "archiver";

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

  // Create ZIP file
  await createZip(distPath, `dist/${browser}-extension.zip`);
  console.log(`✓ Built ${browser} extension and created ZIP`);
}

async function createZip(sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve());
    archive.on('error', (err) => reject(err));

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

const getManifestPath = (browser) => browser === "chrome" ? "manifests/manifest.v3.json" : "manifests/manifest.v2.json";

await Promise.all(BROWSERS.map(build));

console.log("🎉 All extensions built and zipped successfully!");
