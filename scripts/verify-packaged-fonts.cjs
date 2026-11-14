// Check the actual packaged archive, not just files in the build checkout.
const fs = require("node:fs"), path = require("node:path"), { createHash } = require("node:crypto");
const { extractFile } = require("@electron/asar");
const root = path.resolve(__dirname, "..");
function verifyFonts(archive) {
  const manifestPath = "assets/fonts/creative-fonts-sources.json";
  const manifestBytes = fs.readFileSync(path.join(root, manifestPath));
  if (!extractFile(archive, manifestPath).equals(manifestBytes)) throw Error("Packaged font provenance differs from source.");
  const files = JSON.parse(manifestBytes).files;
  for (const file of files) {
    const bytes = extractFile(archive, `assets/fonts/${file.file}`);
    if (createHash("sha256").update(bytes).digest("hex") !== file.sha256) throw Error(`Missing or changed packaged font/notice: ${file.file}`);
  }
  for (const name of ["Manrope.ttf", "Manrope-OFL.txt", "DMSerifDisplay.ttf", "DMSerifDisplay-OFL.txt"]) {
    if (!extractFile(archive, `assets/fonts/${name}`).equals(fs.readFileSync(path.join(root, "assets/fonts", name))))
      throw Error(`Packaged title font/notice differs: ${name}`);
  }
  console.log(`Verified ${files.length + 4} packaged font files and notices against their exact source bytes.`);
}
module.exports = { verifyFonts };
if (require.main === module) verifyFonts(process.argv[2]);
