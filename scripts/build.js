import { rm, mkdir } from "fs/promises";
import { createWriteStream } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import archiver from "archiver";

const execAsync = promisify(exec);
const BROWSERS = ["chrome", "firefox"];

async function build(browser) {
  const distPath = `dist/${browser}`;
  console.log(`🔨 Building ${browser} extension...`);

  // Build with webpack using browser-specific config
  console.log("📦 Compiling and bundling...");
  await execAsync(`npx webpack --mode=production --env browser=${browser}`);
  
  // Create ZIP file
  await createZip(distPath, `dist/${browser}-extension.zip`);
  console.log(`✓ Built ${browser} extension and created ZIP`);
}

async function createZip(sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve());
    archive.on("error", (err) => reject(err));

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

// Clean and prepare dist directory
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

// Build extensions sequentially or in parallel
await Promise.all(BROWSERS.map(build));

console.log("🎉 All extensions built and zipped successfully!");