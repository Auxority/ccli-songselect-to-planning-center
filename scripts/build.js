import { rm, mkdir } from "fs/promises";
import { createWriteStream } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import archiver from "archiver";

const execAsync = promisify(exec);
const BROWSERS = ["chrome", "firefox"];

async function build(targetBrowser) {
  const distPath = `dist/${targetBrowser}`;
  console.log(`🔨 Building ${targetBrowser} extension...`);

  // Build with webpack using browser-specific config
  console.log("📦 Compiling and bundling...");
  await execAsync(`npx webpack --mode=production --env browser=${targetBrowser}`);
  
  // Create ZIP file
  await createZip(distPath, `dist/${targetBrowser}-extension.zip`);
  console.log(`✓ Built ${targetBrowser} extension and created ZIP`);
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

async function createSourceBundle(outputDir, zipPath) {
  console.log("✍️ Preparing source bundle");
  await mkdir(outputDir, { recursive: true });

  const tmpTar = `${outputDir}.tar`;

  await execAsync(`git archive --format=tar -o ${tmpTar} HEAD`);
  await execAsync(`tar -xf ${tmpTar} -C ${outputDir}`);

  if (zipPath) {
    await createZip(outputDir, zipPath);
  }

  await rm(tmpTar, { force: true });
  await rm("dist/source", { recursive: true, force: true });

  console.log(`✓ Source bundle ZIP created at ${zipPath}`);
}

// Clean and prepare dist directory
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

// Build extensions
await Promise.all(BROWSERS.map(build));

// Create a clean source bundle for Firefox submission
await createSourceBundle("dist/source", "dist/source.zip");

console.log("🎉 All extensions built and zipped successfully!");