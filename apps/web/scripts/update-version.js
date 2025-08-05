import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read version from version.txt
const versionPath = path.join(__dirname, "../src-tauri/version.txt");
const version = fs.readFileSync(versionPath, "utf8").trim();

// Update package.json
const packageJsonPath = path.join(__dirname, "../package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
packageJson.version = version;

// Write back to package.json
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

console.log(`Updated package.json version to ${version}`);
