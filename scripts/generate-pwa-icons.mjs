import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. Standard Brand Icon (Clean rounded gradient box with stylized Y monogram)
const standardSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#8B5CF6"/>
      <stop offset="50%" stop-color="#7C3AED"/>
      <stop offset="100%" stop-color="#5B21B6"/>
    </linearGradient>
    <linearGradient id="yGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#F3E8FF"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#4C1D95" flood-opacity="0.45"/>
    </filter>
  </defs>
  <!-- Background -->
  <rect width="512" height="512" rx="112" fill="url(#bgGrad)"/>
  
  <!-- Subtle inner border -->
  <rect x="6" y="6" width="500" height="500" rx="106" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="6"/>

  <!-- Centered Ybex "Y" Monogram -->
  <g filter="url(#glow)">
    <path d="M140 130 L226 260 L226 385 C226 398 237 408 250 408 L262 408 C275 408 286 398 286 385 L286 260 L372 130 C380 118 371 104 357 104 L315 104 C305 104 296 110 291 119 L256 182 L221 119 C216 110 207 104 197 104 L155 104 C141 104 132 118 140 130 Z" fill="url(#yGrad)"/>
    <!-- Modern Tech Accent Dot -->
    <circle cx="372" cy="116" r="14" fill="#34D399"/>
  </g>
</svg>`;

// 2. Maskable Icon (Android requires full bleed background and 80% safe zone)
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#8B5CF6"/>
      <stop offset="50%" stop-color="#7C3AED"/>
      <stop offset="100%" stop-color="#5B21B6"/>
    </linearGradient>
    <linearGradient id="yGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#F3E8FF"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="12" flood-color="#4C1D95" flood-opacity="0.4"/>
    </filter>
  </defs>
  <!-- Full bleed background for Android dynamic shape masks -->
  <rect width="512" height="512" fill="url(#bgGrad)"/>

  <!-- Centered safe-zone scaled Y Monogram (kept strictly within 380px safe circle) -->
  <g transform="translate(64, 64) scale(0.75)" filter="url(#glow)">
    <path d="M140 130 L226 260 L226 385 C226 398 237 408 250 408 L262 408 C275 408 286 398 286 385 L286 260 L372 130 C380 118 371 104 357 104 L315 104 C305 104 296 110 291 119 L256 182 L221 119 C216 110 207 104 197 104 L155 104 C141 104 132 118 140 130 Z" fill="url(#yGrad)"/>
    <circle cx="372" cy="116" r="14" fill="#34D399"/>
  </g>
</svg>`;

async function generate() {
  fs.writeFileSync(path.join(publicDir, 'icon.svg'), standardSvg);
  console.log('Saved public/icon.svg');

  // 192x192
  await sharp(Buffer.from(standardSvg))
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'pwa-192x192.png'));
  console.log('Generated pwa-192x192.png');

  // 512x512
  await sharp(Buffer.from(standardSvg))
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-512x512.png'));
  console.log('Generated pwa-512x512.png');

  // 512x512 maskable
  await sharp(Buffer.from(maskableSvg))
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-maskable-512x512.png'));
  console.log('Generated pwa-maskable-512x512.png');

  // 180x180 Apple touch icon
  await sharp(Buffer.from(standardSvg))
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('Generated apple-touch-icon.png');
}

generate().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
