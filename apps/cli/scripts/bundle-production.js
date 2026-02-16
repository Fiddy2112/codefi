#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(PACKAGE_ROOT, 'dist');
const ASSETS_DIR = path.join(DIST_DIR, 'assets');

console.log('🎵 Creating production bundle for CodeFi CLI...');

// Create assets directory in dist
if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

// Copy audio files to dist/assets
const sourceTracksDir = path.join(PACKAGE_ROOT, 'assets', 'tracks');
const distTracksDir = path.join(ASSETS_DIR, 'tracks');

if (!fs.existsSync(distTracksDir)) {
  fs.mkdirSync(distTracksDir, { recursive: true });
}

const audioFiles = [
  'focus.mp3',
  'chill.mp3', 
  'terminal-dreams.mp3'
];

console.log('📦 Bundling audio files...');
audioFiles.forEach(file => {
  const sourcePath = path.join(sourceTracksDir, file);
  const destPath = path.join(distTracksDir, file);
  
  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, destPath);
    console.log(`✓ Copied ${file}`);
  } else {
    console.log(`❌ Missing ${file}`);
  }
});

// Copy scripts
const sourceScriptsDir = path.join(PACKAGE_ROOT, 'scripts');
const distScriptsDir = path.join(DIST_DIR, 'scripts');

if (!fs.existsSync(distScriptsDir)) {
  fs.mkdirSync(distScriptsDir, { recursive: true });
}

const scriptFiles = fs.readdirSync(sourceScriptsDir);
scriptFiles.forEach(file => {
  const sourcePath = path.join(sourceScriptsDir, file);
  const destPath = path.join(distScriptsDir, file);
  
  fs.copyFileSync(sourcePath, destPath);
  console.log(`✓ Copied script ${file}`);
});

// Update trackDownloader for production
const trackDownloaderPath = path.join(DIST_DIR, 'src', 'services', 'trackDownloader.js');
if (fs.existsSync(trackDownloaderPath)) {
  let content = fs.readFileSync(trackDownloaderPath, 'utf8');
  
  // Replace development path with production path
  content = content.replace(
    /const assetsDir = path\.join\(process\.cwd\(\), 'assets', 'tracks'\);/,
    `const assetsDir = path.join(__dirname, '../../assets/tracks');`
  );
  
  fs.writeFileSync(trackDownloaderPath, content);
  console.log('✓ Updated trackDownloader for production');
}

console.log('\n🎉 Production bundle created!');
console.log('📁 Location: dist/');
console.log('🚀 Ready for: npm pack && npm publish');