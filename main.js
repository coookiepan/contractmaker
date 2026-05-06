// ============================================================
// DUSKIN 報價產生器 - 主入口
//
// 使用方式：
//   node main.js <client.json> [--output-dir=...] [--pdf]
//
// 範例：
//   node main.js clients/dejiang_base.json
//   node main.js clients/lefei.json --pdf
// ============================================================
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { buildWord } = require('./builders/quote');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node main.js <client.json> [--output-dir=...] [--pdf]');
  process.exit(1);
}

const clientFile = args[0];
const outputDir = (args.find(a => a.startsWith('--output-dir=')) || '--output-dir=/mnt/user-data/outputs').split('=')[1];
const makePdf = args.includes('--pdf');

const config = JSON.parse(fs.readFileSync(clientFile, 'utf-8'));

// Filename
const versionSuffix = config.version ? `_${config.version}` : '';
const baseName = `報價單_${config.client.replace(/[\s\/\\]/g, '')}${versionSuffix}`;
const wordPath = path.join(outputDir, `${baseName}.docx`);

console.log(`📝 產生 Word: ${wordPath}`);
buildWord(config, wordPath).then(({ outputPath, size }) => {
  console.log(`   ✓ ${(size / 1024).toFixed(1)} KB`);

  if (makePdf) {
    const pdfPath = wordPath.replace(/\.docx$/, '.pdf');
    console.log(`📄 轉 PDF: ${pdfPath}`);
    try {
      execSync(`python3 /mnt/skills/public/docx/scripts/office/soffice.py --headless --convert-to pdf "${wordPath}" --outdir "${outputDir}"`, { stdio: 'pipe' });
      console.log(`   ✓ ${(fs.statSync(pdfPath).size / 1024).toFixed(1)} KB`);
    } catch (err) {
      console.error(`   ✗ PDF 轉換失敗:`, err.message);
    }
  }
}).catch(err => {
  console.error('❌ 錯誤:', err.message);
  process.exit(1);
});
