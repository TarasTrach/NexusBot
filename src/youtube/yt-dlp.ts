import fs from "fs";
import path from "path";
import https from "https";
import { execFile } from "child_process";

const BIN_DIR = path.join(process.cwd(), "bin");
const BINARY_NAME = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
const BINARY_PATH = path.join(BIN_DIR, BINARY_NAME);

function getDownloadUrl(): string {
  const base = "https://github.com/yt-dlp/yt-dlp/releases/latest/download";
  switch (process.platform) {
    case "win32":
      return `${base}/yt-dlp.exe`;
    case "darwin":
      return `${base}/yt-dlp_macos`;
    default:
      return `${base}/yt-dlp_linux`;
  }
}

function followRedirectAndDownload(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          const location = res.headers.location;
          if (!location) return reject(new Error("Redirect without location"));
          return followRedirectAndDownload(location, dest).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on("finish", () => {
          file.close();
          if (process.platform !== "win32") {
            fs.chmodSync(dest, 0o755);
          }
          resolve();
        });
        file.on("error", (err) => {
          fs.unlinkSync(dest);
          reject(err);
        });
      })
      .on("error", reject);
  });
}

export async function ensureYtDlp(): Promise<string> {
  if (fs.existsSync(BINARY_PATH)) {
    return BINARY_PATH;
  }
  fs.mkdirSync(BIN_DIR, { recursive: true });
  console.log("Downloading yt-dlp binary...");
  await followRedirectAndDownload(getDownloadUrl(), BINARY_PATH);
  console.log("yt-dlp downloaded successfully");
  return BINARY_PATH;
}

export async function execYtDlp(args: string[]): Promise<string> {
  const binaryPath = await ensureYtDlp();
  console.log(`[yt-dlp] Running: ${binaryPath} ${args.join(" ")}`);
  return new Promise((resolve, reject) => {
    execFile(binaryPath, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (stderr) console.log(`[yt-dlp] stderr: ${stderr}`);
      if (err) {
        console.error(`[yt-dlp] ERROR: ${err.message}`);
        reject(new Error(`yt-dlp error: ${stderr || err.message}`));
        return;
      }
      console.log(`[yt-dlp] Completed successfully (output: ${stdout.length} chars)`);
      resolve(stdout);
    });
  });
}
