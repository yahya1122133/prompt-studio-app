#!/usr/bin/env node

/**
 * Package Maintenance Script
 * Prevents common package.json failures and keeps dependencies updated
 */

const fs = require('fs');
const { execSync } = require('child_process');

console.log('🔧 Running package maintenance...');

// Clean up common problematic files
const filesToClean = [
  'package-lock.json',
  'node_modules/.cache',
  '.npm/_cacache'
];

filesToClean.forEach(file => {
  try {
    if (fs.existsSync(file)) {
      execSync(`rm -rf "${file}"`, { stdio: 'inherit' });
      console.log(`✅ Cleaned: ${file}`);
    }
  } catch (error) {
    console.log(`⚠️  Could not clean ${file}: ${error.message}`);
  }
});

// Check for common issues in package.json
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// Fix common version conflicts
const fixes = [];

// Check for react-scripts version
if (packageJson.dependencies['react-scripts'] === '^0.0.0') {
  fixes.push('react-scripts version is invalid (^0.0.0)');
}

// Check for missing node-fetch
if (!packageJson.dependencies['node-fetch']) {
  fixes.push('node-fetch is missing (required for Netlify functions)');
}

// Check engine requirements
if (packageJson.engines && packageJson.engines.node) {
  const nodeVersion = process.version;
  console.log(`📊 Current Node.js: ${nodeVersion}`);
  console.log(`📊 Required Node.js: ${packageJson.engines.node}`);
}

if (fixes.length > 0) {
  console.log('🚨 Issues found:');
  fixes.forEach(fix => console.log(`   - ${fix}`));
} else {
  console.log('✅ No issues found in package.json');
}

// Run npm install with optimized settings
console.log('📦 Installing dependencies...');
try {
  execSync('npm install --no-audit --no-fund', { stdio: 'inherit' });
  console.log('✅ Dependencies installed successfully');
} catch (error) {
  console.error('❌ Installation failed:', error.message);
  process.exit(1);
}

console.log('🎉 Package maintenance completed!');
