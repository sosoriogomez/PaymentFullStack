// Renders the product illustrations (assets-src/products/*.svg) into responsive variants:
// {key}-{320|640|960}.{avif|webp|jpg} in public/images/products. Run: npm run images -w apps/web
import { mkdir, readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import sharp from 'sharp';

const SOURCE_DIR = new URL('../assets-src/products/', import.meta.url).pathname;
const OUTPUT_DIR = new URL('../public/images/products/', import.meta.url).pathname;
const WIDTHS = [320, 640, 960];
const ASPECT_RATIO = 3 / 4; // height / width (4:3 images)
const BUDGET_640_BYTES = 80 * 1024; // spec FE-10: < 80 KB per 640 px variant

const FORMATS = {
  avif: (image) => image.avif({ quality: 50, effort: 6 }),
  webp: (image) => image.webp({ quality: 72 }),
  jpg: (image) => image.jpeg({ quality: 78, mozjpeg: true, progressive: true }),
};

async function render(source, key) {
  const files = [];
  for (const width of WIDTHS) {
    const height = Math.round(width * ASPECT_RATIO);
    for (const [extension, encode] of Object.entries(FORMATS)) {
      const file = join(OUTPUT_DIR, `${key}-${width}.${extension}`);
      await encode(sharp(source, { density: 300 }).resize(width, height, { fit: 'cover' })).toFile(
        file,
      );
      files.push({ file, width, size: (await stat(file)).size });
    }
  }
  return files;
}

await mkdir(OUTPUT_DIR, { recursive: true });
const sources = (await readdir(SOURCE_DIR)).filter((name) => name.endsWith('.svg'));
let overBudget = 0;
for (const name of sources) {
  const key = basename(name, '.svg');
  const files = await render(join(SOURCE_DIR, name), key);
  for (const { file, width, size } of files) {
    const flag = width === 640 && size > BUDGET_640_BYTES ? '  <-- over budget' : '';
    if (flag) overBudget += 1;
    console.log(`${basename(file).padEnd(34)} ${(size / 1024).toFixed(1).padStart(6)} KB${flag}`);
  }
}
if (overBudget > 0) {
  console.error(`${overBudget} variant(s) exceed the 80 KB budget`);
  process.exit(1);
}
