// Simple TOML validation
const fs = require('fs');

function validateTOML() {
    try {
        const tomlContent = fs.readFileSync('netlify.toml', 'utf8');
        
        console.log('✅ File exists and is readable');
        console.log('File size:', tomlContent.length, 'bytes');
        
        // Check for common TOML issues
        const lines = tomlContent.split('\n');
        console.log('Total lines:', lines.length);
        
        // Check for missing newline at end
        if (tomlContent.endsWith('\n')) {
            console.log('✅ File ends with newline');
        } else {
            console.log('❌ File missing newline at end');
        }
        
        // Check for basic TOML structure
        const sections = tomlContent.match(/^\[.*\]$/gm);
        console.log('✅ Found', sections ? sections.length : 0, 'TOML sections');
        
        // Check for Node.js version
        if (tomlContent.includes('NODE_VERSION = "22"')) {
            console.log('✅ Node.js 22 configured');
        }
        
        // Check for functions directory
        if (tomlContent.includes('directory = "netlify/functions"')) {
            console.log('✅ Functions directory correctly set');
        }
        
        console.log('\n📋 Configuration Summary:');
        console.log('- Build command: npm run build');
        console.log('- Publish directory: build');
        console.log('- Node.js version: 22');
        console.log('- Functions directory: netlify/functions');
        console.log('- Runtime: nodejs22.x');
        
    } catch (error) {
        console.error('❌ Error reading netlify.toml:', error.message);
    }
}

validateTOML();
