// One-time mechanical migration; excludes the inventory files owned by another task.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../src');
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}
for (const file of walk(root)) {
  if (!/\.tsx?$/.test(file) || /[\\/]inventory[\\/]/.test(file)) continue;
  let source = fs.readFileSync(file, 'utf8');
  const before = source;
  if (/<img\b/.test(source)) {
    source = source.replace(/<img\b/g, '<AssetImage');
    source = source.replace(/(import\s)/, "import { AssetImage } from '@/components/ui/asset-image';\n\n$1");
  }
  let errorHelper = false;
  source = source.replace(/\b(err|error)(?:\?\.)?\.?response\?\.data\?\.message\s*(?:\|\||\?\?)\s*('[^']*'|"[^"]*")/g,
    (_, variable, fallback) => { errorHelper = true; return `getErrorMessage(${variable}, ${fallback})`; });
  if (errorHelper) {
    source = source.replace(/\b(err|error): any\b/g, '$1: unknown');
    source = source.replace(/(import\s)/, "import { getErrorMessage } from '@/utils/api-error';\n\n$1");
  }
  // JSX callback event types are supplied by their input/select component.
  source = source.replace(/onChange=\{\(e: any\)/g, 'onChange={(e)');
  if (source !== before) fs.writeFileSync(file, source);
}
