// 測試引擎：跑所有客戶配置，輸出文字版預覽
const fs = require('fs');
const path = require('path');
const { previewText, expandQuote } = require('./engine');

const clientsDir = path.join(__dirname, 'clients');
const files = fs.readdirSync(clientsDir).filter(f => f.endsWith('.json'));

for (const file of files) {
  console.log('\n' + '='.repeat(70));
  console.log(`📄 ${file}`);
  console.log('='.repeat(70));
  try {
    const config = JSON.parse(fs.readFileSync(path.join(clientsDir, file), 'utf-8'));
    console.log(previewText(config));
  } catch (err) {
    console.error('❌ 錯誤:', err.message);
  }
}
