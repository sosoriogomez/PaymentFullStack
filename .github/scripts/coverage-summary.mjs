// Prints a Markdown table from an istanbul json-summary: node coverage-summary.mjs <file> <title>
import { existsSync, readFileSync } from 'node:fs';

const [file, title = 'Coverage'] = process.argv.slice(2);
if (!file || !existsSync(file)) {
  console.log(`### ${title}\n\nNo coverage report found.`);
  process.exit(0);
}

const { total } = JSON.parse(readFileSync(file, 'utf8'));
const metrics = ['statements', 'branches', 'functions', 'lines'];
const rows = metrics.map((metric) => {
  const { pct, covered, total: count } = total[metric];
  return `| ${metric} | ${pct.toFixed(2)} % | ${covered}/${count} |`;
});

console.log(
  [`### ${title}`, '', '| Métrica | Cobertura | Cubierto |', '|---|---|---|', ...rows, ''].join(
    '\n',
  ),
);
