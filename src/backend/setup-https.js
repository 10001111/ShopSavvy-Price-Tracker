const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const scriptPath = path.join(__dirname, "setup-https.ps1");
const certsDir = path.join(__dirname, "certs");
const pfxPath = path.join(certsDir, "localhost.pfx");

// Check if certificates already exist
if (fs.existsSync(pfxPath)) {
  console.log("✓ Certificates already exist");
  console.log("\nYour certificate is ready at:");
  console.log(`  PFX: ${pfxPath}`);
  console.log("\n✅ HTTPS is ready! Start your server with: npm run dev");
  process.exit(0);
}

console.log("Running PowerShell script to generate certificates...\n");

try {
  execSync(`powershell.exe -ExecutionPolicy Bypass -File "${scriptPath}"`, {
    stdio: "inherit",
  });
} catch (error) {
  console.error("\n❌ Setup failed. You can still run with HTTP.");
  process.exit(1);
}
