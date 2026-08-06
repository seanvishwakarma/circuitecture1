const fs = require('fs');
const path = require('path');

const htmlDir = path.join(__dirname, 'public');
const files = fs.readdirSync(htmlDir).filter(f => f.endsWith('.html'));

let exitCode = 0;

for (const file of files) {
  const filePath = path.join(htmlDir, file);
  const content = fs.readFileSync(filePath, 'utf-8');
  const errors = [];

  if (!content.startsWith('<!DOCTYPE html>') && !content.startsWith('<!doctype html>')) {
    errors.push('Missing DOCTYPE declaration');
  }

  const titleMatch = content.match(/<title>(.*?)<\/title>/is);
  if (!titleMatch || !titleMatch[1].trim()) {
    errors.push('Missing or empty <title> tag');
  }

  const charsetMatch = content.match(/charset=["']?([\w-]+)["']?/i);
  if (!charsetMatch) {
    errors.push('Missing charset declaration');
  }

  const viewportMatch = content.match(/name=["']viewport["']/i);
  if (!viewportMatch) {
    errors.push('Missing viewport meta tag');
  }

  if (errors.length > 0) {
    console.error(`\n${file}:`);
    errors.forEach(e => console.error(`  - ${e}`));
    exitCode = 1;
  } else {
    console.log(`${file}: OK`);
  }
}

process.exit(exitCode);
