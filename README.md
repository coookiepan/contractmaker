# DUSKIN 報價引擎

樂清服務股份有限公司 - 商品租賃報價單／合約書／方案比較圖卡產生引擎。

## 目錄結構

```
duskin_engine/
├── catalog.json              商品庫（120 個商品，從 CSV 自動匯入）
├── engine.js                 核心引擎（價格運算、折扣、稅務、註記）
├── builders/
│   └── quote.js              報價單 Word 產生器
├── main.js                   CLI 入口
├── test.js                   文字版預覽（除錯用）
└── clients/                  客戶配置 (JSON)
    ├── dejiang_base.json
    ├── dejiang_premium.json
    ├── lefei.json
    ├── guaguayuan.json
    ├── lianshang_quote.json
    └── lianshang_year.json
```

## 兩種使用方式

### A. 網頁版（手機 / 平板 / 電腦皆可，推薦）

`web/` 是純靜態 PWA，**不需安裝任何東西**，瀏覽器開即用。可直接從手機操作、產出 Word 並下載。

**部署到 GitHub Pages：**
1. 推到 GitHub
2. Settings → Pages → Source: `Deploy from a branch` → `main` (或目前分支) → `/ (root)`
3. 等 1 分鐘後，網址會是 `https://<你的帳號>.github.io/contractmaker/web/`
4. 用手機開那個網址 → Safari 「加入主畫面」 / Chrome「安裝應用程式」 → 變成桌面 icon，可離線使用

**本地測試（電腦）：**
```bash
npx http-server -p 8080
# 開 http://localhost:8080/web/
```
（不能用 `file://` 直開，瀏覽器會擋 fetch）

**功能：**
- 動態新增 / 刪除「區域」與「品項」
- 商品搜尋彈窗（120 個商品分類顯示）
- 文字預覽 + 下載 Word
- 草稿自動存 localStorage（重開不會丟）
- 多客戶範本另存為 / 載入

### B. CLI 版（電腦 / 自動化）

```bash
npm install
node main.js clients/dejiang_base.json --pdf
node test.js     # 文字預覽全部客戶
```

## 核心概念：價格與週期

### catalog 永遠儲存「每次更換的單價」(2W 單價)

| 範例 | catalog price | cycle |
|---|---:|---|
| EXLH 強力刮砂L | 360 | 2W (每 2 週換) |
| DOME 尿石去除劑 | 200 | 4W (每 4 週換) |
| HPL 訂做地墊L | 360 | 2W |

**4W 月金額** = `price × (cycle === '2W' ? 2 : 1) × qty`

### 報價單顯示週期 (displayCycle)

不論 catalog cycle 是什麼，**報價單顯示的單價可以彈性切換**：

```json
{ "code": "EXLH", "qty": 1, "displayCycle": "2W" }  // 報價單顯示「單價 360, 2W」
{ "code": "EXLH", "qty": 1, "displayCycle": "4W" }  // 報價單顯示「單價 720, 4W」
```

兩種顯示**月金額都是 720**（換算邏輯不變）。

可以在配置頂層設 `displayCycle: "4W"` 一次套用全部，個別 item 再 override。

## 客戶配置範例

### 簡單版（單區）

```json
{
  "client": "瓜瓜園地瓜生態故事館",
  "date": "2026/04/29",
  "areaName": "商品明細",
  "displayCycle": "4W",
  "items": [
    { "code": "FFLK", "qty": 2, "priceOverride": 400 }
  ],
  "showLocation": false
}
```

### 多區、混合週期顯示

```json
{
  "client": "德匠高爾夫俱樂部股份有限公司",
  "version": "基礎版",
  "date": "2026/04/22",
  "displayCycle": "4W",
  "areas": [
    {
      "name": "VIP 區",
      "items": [
        { "code": "EXLH", "qty": 1, "loc": "VIP門" },
        { "code": "HPS", "qty": 1, "loc": "VIP門內", "displayCycle": "2W" },
        { "code": "DOME", "qty": 1, "loc": "VIP廁所" }
      ]
    }
  ]
}
```

### 整體折扣 + 取整百

```json
{
  "client": "聯上APPLE接待中心",
  "version": "一年方案",
  "displayCycle": "4W",
  "items": [...],
  "discount": 0.8,
  "roundTotalToHundred": true
}
```

## 折扣優先級（高到低）

| 設定 | 用途 |
|---|---|
| `priceOverride: 300` | 客戶特殊單價（依 displayCycle 解讀） |
| item 的 `discount: 0.8` | 個別品項折扣 |
| area 的 `discount: 0.8` | 區域折扣 |
| 頂層的 `discount: 0.8` | 整體折扣（限 discountable=true） |

## 配置欄位

| 欄位 | 預設值 | 用途 |
|---|---|---|
| `client` | (必填) | 客戶名稱 |
| `version` | 無 | 版本後綴（檔名用） |
| `date` | (必填) | 報價日期 |
| `displayCycle` | 隨商品 | 全域報價單顯示週期 |
| `discount` | null | 整體折扣比例 |
| `roundTotalToHundred` | false | 總額向上取整百 |
| `showLocation` | true | 是否顯示位置欄 |
| `showStamp` | true | 是否顯示核章區 |
| `showCustomerNumber` | true | 是否顯示統編欄 |

## 引擎輸出（每個 item）

```javascript
{
  originalPrice: 720,        // 顯示用原價
  unitPrice: 576,            // 顯示用售價（依 displayCycle）
  pricePerChange: 288,       // 內部運算用「每次更換售價」
  monthly: 576,              // 4W 月金額
  monthlyAtOriginal: 720,
  discount: 0.8,             // 折扣比例
  discountPct: 20,           // 省 20%
  productCycle: '2W',        // catalog 上的實際週期
  displayCycle: '4W',        // 報價單顯示週期
  isDiscounted: true
}
```

## 樂清聯絡資訊（已預設於 builder）

- 承辦人：潘秉均
- 手機：0928-374-141
- 電話：06-253-1522
- 傳真：06-253-1533
- 地址：台南市永康區中正路 337 巷 106 號

## 待開發 (Phase 2)

- [ ] `builders/contract.js` 合約書產生器
- [ ] `builders/card.js` 方案比較圖卡（HTML/PNG/PDF）
- [ ] 多版本一次產出（基礎/進階/頂規）
- [ ] 折扣表（年約自動套折扣比例）
