const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

if (!fs.existsSync('index.source.html')) {
  if (fs.existsSync('index.html')) {
    console.log('✓ [Static Deploy] index.source.html not found, but standalone index.html already exists. Skipping build!');
    process.exit(0);
  } else {
    console.error('Error: Neither index.source.html nor index.html was found.');
    process.exit(1);
  }
}

console.log('--- 1. Restoring index.html from index.source.html ---');
fs.copyFileSync('index.source.html', 'index.html');

console.log('--- 2. Building single-file bundle via Vite ---');
execSync('npx vite build', { stdio: 'inherit' });

console.log('--- 3. Moving dist/index.html to root index.html ---');
fs.copyFileSync(path.join('dist', 'index.html'), 'index.html');

console.log('--- 4. Cleaning up dist folder ---');
fs.rmSync('dist', { recursive: true, force: true });

console.log('✓ SUCCESS: Standalone single-file index.html is ready in root folder!');
