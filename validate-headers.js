const fs = require('fs');

try {
  const tomlContent = fs.readFileSync('netlify.toml', 'utf8');
  
  const requiredHeaders = [
    'X-Frame-Options',
    'X-Content-Type-Options',
    'Referrer-Policy',
    'Content-Security-Policy'
  ];

  let missingHeaders = [];
  
  for (const header of requiredHeaders) {
    if (!tomlContent.includes(header + ' =')) {
      missingHeaders.push(header);
    }
  }

  if (missingHeaders.length > 0) {
    throw new Error('Missing required headers: ' + missingHeaders.join(', '));
  }

  console.log('All required headers are present');
  process.exit(0);
} catch (error) {
  console.error('Header validation failed:');
  console.error(error.message);
  process.exit(1);
}
