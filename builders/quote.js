// ============================================================
// 報價單 Word 產生器 (UMD - 瀏覽器與 Node 皆可用)
//
// Node:
//   const { buildWord } = require('./builders/quote');
//   await buildWord(config, '/tmp/out.docx');
//
// Browser (需先載入 docx UMD + engine):
//   const blob = await QuoteBuilder.buildBlob(config);
// ============================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const docx = require('docx');
    const engineModule = require('../engine');
    module.exports = factory(docx, engineModule);
  } else {
    root.QuoteBuilder = factory(root.docx, null);
  }
}(typeof self !== 'undefined' ? self : this, function (docx, engineModule) {

  const {
    Document, Packer, Paragraph, Table, TableRow, TableCell,
    TextRun, AlignmentType, BorderStyle, WidthType, HeightRule,
    VerticalAlign, ShadingType, HeadingLevel
  } = docx;

  const COMPANY_INFO = {
    name: '樂清服務股份有限公司 台南營業所',
    contact: '潘秉均',
    mobile: '0928-374-141',
    phone: '06-253-1522',
    fax: '06-253-1533',
    address: '台南市永康區中正路 337 巷 106 號'
  };

  const COLOR_HEADER = 'D9E1F2';
  const COLOR_SUBTOTAL = 'F2F2F2';
  const COLOR_TOTAL = 'FFE699';
  const COLOR_AREA = 'BDD7EE';

  function fmt(n) {
    if (n == null) return '';
    return Number(n).toLocaleString();
  }

  function thinBorder() {
    return {
      style: BorderStyle.SINGLE,
      size: 4,
      color: '888888'
    };
  }

  function allBorders() {
    return {
      top: thinBorder(),
      bottom: thinBorder(),
      left: thinBorder(),
      right: thinBorder()
    };
  }

  function txt(text, opts) {
    opts = opts || {};
    return new TextRun({
      text: String(text == null ? '' : text),
      bold: !!opts.bold,
      color: opts.color,
      size: opts.size || 20,        // half-points; 20 = 10pt
      font: opts.font || '微軟正黑體'
    });
  }

  function para(text, opts) {
    opts = opts || {};
    const runs = Array.isArray(text)
      ? text
      : [txt(text, opts)];
    return new Paragraph({
      alignment: opts.alignment || AlignmentType.LEFT,
      spacing: { before: 0, after: 0 },
      children: runs
    });
  }

  function cell(content, opts) {
    opts = opts || {};
    const paragraphs = Array.isArray(content)
      ? content
      : [para(content, opts)];
    return new TableCell({
      width: opts.width,
      shading: opts.fill ? {
        type: ShadingType.CLEAR,
        color: 'auto',
        fill: opts.fill
      } : undefined,
      verticalAlign: VerticalAlign.CENTER,
      borders: allBorders(),
      columnSpan: opts.colSpan,
      rowSpan: opts.rowSpan,
      children: paragraphs
    });
  }

  // ============================================================
  // 標題列 (報價單 + 日期)
  // ============================================================
  function buildTitle(quote) {
    return [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [txt('報　價　單', { bold: true, size: 36 })]
      }),
    ];
  }

  // ============================================================
  // 客戶資訊區（兩欄表格：左客戶 右公司聯絡）
  // ============================================================
  function buildCustomerHeader(quote) {
    const left = [
      para([txt('客戶名稱：', { bold: true }), txt(quote.client || '')]),
    ];
    if (quote.show.customerNumber) {
      left.push(para([txt('統一編號：', { bold: true }), txt(quote.customerInfo.taxId || '')]));
    }
    if (quote.customerInfo.contact) {
      left.push(para([txt('聯絡人：', { bold: true }), txt(quote.customerInfo.contact)]));
    }
    if (quote.customerInfo.phone) {
      left.push(para([txt('電話：', { bold: true }), txt(quote.customerInfo.phone)]));
    }
    if (quote.customerInfo.address) {
      left.push(para([txt('地址：', { bold: true }), txt(quote.customerInfo.address)]));
    }

    const right = [
      para([txt('報價日期：', { bold: true }), txt(quote.date || '')]),
      para([txt('承辦人：', { bold: true }), txt(COMPANY_INFO.contact)]),
      para([txt('手機：', { bold: true }), txt(COMPANY_INFO.mobile)]),
      para([txt('電話：', { bold: true }), txt(COMPANY_INFO.phone)]),
      para([txt('地址：', { bold: true }), txt(COMPANY_INFO.address)])
    ];

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 55, type: WidthType.PERCENTAGE },
              borders: noBorders(),
              children: left
            }),
            new TableCell({
              width: { size: 45, type: WidthType.PERCENTAGE },
              borders: noBorders(),
              children: right
            })
          ]
        })
      ]
    });
  }

  function noBorders() {
    const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    return { top: none, bottom: none, left: none, right: none };
  }

  // ============================================================
  // 商品明細表
  // ============================================================
  function buildItemTable(quote) {
    const showLoc = quote.show.location;

    // 欄位
    const headers = ['商品代號', '品名', '規格', '數量', '週期', '單價(含稅)', '4W月金額'];
    const widths = [10, showLoc ? 24 : 30, 10, 8, 8, showLoc ? 14 : 18, 16];
    if (showLoc) {
      headers.splice(2, 0, '位置');
      widths.splice(2, 0, 14);
    }

    const rows = [];

    // Header row
    rows.push(new TableRow({
      tableHeader: true,
      children: headers.map((h, i) => cell(h, {
        bold: true,
        alignment: AlignmentType.CENTER,
        fill: COLOR_HEADER,
        width: { size: widths[i], type: WidthType.PERCENTAGE }
      }))
    }));

    // Areas
    const multiArea = quote.areas.length > 1;

    for (const area of quote.areas) {
      if (multiArea) {
        rows.push(new TableRow({
          children: [cell(area.name, {
            bold: true,
            fill: COLOR_AREA,
            colSpan: headers.length
          })]
        }));
      }

      for (const it of area.items) {
        const priceText = (it.isDiscounted || (it.discountSource === 'override' && it.unitPrice !== it.originalPrice))
          ? [
              txt(fmt(it.unitPrice), { bold: true, color: 'C00000' }),
              txt(' '),
              txt(`(原 ${fmt(it.originalPrice)})`, { size: 16, color: '808080' })
            ]
          : [txt(fmt(it.unitPrice))];

        const cells = [
          cell(it.code, { alignment: AlignmentType.CENTER }),
        ];
        if (showLoc) cells.push(cell(it.location, { alignment: AlignmentType.CENTER }));
        cells.push(cell(it.name));
        cells.push(cell(it.size || '', { alignment: AlignmentType.CENTER }));
        cells.push(cell(it.qty, { alignment: AlignmentType.CENTER }));
        cells.push(cell(it.cycle, { alignment: AlignmentType.CENTER }));
        cells.push(new TableCell({
          verticalAlign: VerticalAlign.CENTER,
          borders: allBorders(),
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { before: 0, after: 0 },
            children: priceText
          })]
        }));
        cells.push(cell(fmt(it.monthly), { alignment: AlignmentType.RIGHT }));

        rows.push(new TableRow({ children: cells }));
      }

      if (multiArea) {
        rows.push(new TableRow({
          children: [
            cell('小計', {
              bold: true,
              alignment: AlignmentType.RIGHT,
              fill: COLOR_SUBTOTAL,
              colSpan: headers.length - 1
            }),
            cell(fmt(area.subtotal), {
              bold: true,
              alignment: AlignmentType.RIGHT,
              fill: COLOR_SUBTOTAL
            })
          ]
        }));
      }
    }

    // Grand total
    const totalLabel = quote.overallDiscount != null
      ? `月金額總合計 (每 4 週)　原價 ${fmt(quote.grandTotalAtOriginal)}　已優惠 ${fmt(quote.overallSavings)}`
      : '月金額總合計 (每 4 週)';
    rows.push(new TableRow({
      children: [
        cell(totalLabel, {
          bold: true,
          alignment: AlignmentType.RIGHT,
          fill: COLOR_TOTAL,
          colSpan: headers.length - 1
        }),
        cell(fmt(quote.grandTotal), {
          bold: true,
          alignment: AlignmentType.RIGHT,
          fill: COLOR_TOTAL
        })
      ]
    }));

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows
    });
  }

  // ============================================================
  // 備註區
  // ============================================================
  function buildNotes(quote) {
    const out = [
      new Paragraph({
        spacing: { before: 200, after: 60 },
        children: [txt('說明：', { bold: true })]
      })
    ];
    quote.notes.forEach((n, i) => {
      const runs = [txt(`${i + 1}. `, { bold: true })];
      if (n.text) runs.push(txt(n.text));
      if (n.strong) runs.push(txt(n.strong, { bold: true, color: n.strongColor || '000000' }));
      if (n.tail) runs.push(txt(n.tail));
      out.push(new Paragraph({
        spacing: { before: 0, after: 40 },
        children: runs
      }));
    });
    return out;
  }

  // ============================================================
  // 核章區
  // ============================================================
  function buildStamp() {
    const stampCell = (label) => new TableCell({
      width: { size: 33, type: WidthType.PERCENTAGE },
      verticalAlign: VerticalAlign.CENTER,
      borders: allBorders(),
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 60, after: 60 },
          children: [txt(label, { bold: true })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 600, after: 60 },
          children: [txt('')]
        })
      ]
    });

    return [
      new Paragraph({
        spacing: { before: 240, after: 80 },
        children: [txt('核章：', { bold: true })]
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            height: { value: 1200, rule: HeightRule.ATLEAST },
            children: [
              stampCell('客戶簽收'),
              stampCell('業務主管'),
              stampCell('承辦人')
            ]
          })
        ]
      })
    ];
  }

  // ============================================================
  // 組裝整份文件
  // ============================================================
  function buildDocument(quote) {
    const children = [
      ...buildTitle(quote),
      buildCustomerHeader(quote),
      new Paragraph({ spacing: { before: 80, after: 80 }, children: [txt('')] }),
      buildItemTable(quote),
      ...buildNotes(quote)
    ];
    if (quote.show.stamp) {
      children.push(...buildStamp());
    }

    return new Document({
      creator: COMPANY_INFO.name,
      title: '報價單',
      styles: {
        default: {
          document: { run: { font: '微軟正黑體', size: 20 } }
        }
      },
      sections: [{
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 }
          }
        },
        children
      }]
    });
  }

  // ============================================================
  // Public API
  // ============================================================
  function makeDoc(config) {
    if (!engineModule) {
      throw new Error('Browser usage: 請先呼叫 QuoteBuilder.setEngine(engineInstance)');
    }
    const quote = engineModule.expandQuote(config);
    return buildDocument(quote);
  }

  let _engineRef = engineModule;

  // Node: 寫檔
  async function buildWord(config, outputPath) {
    const fs = require('fs');
    const path = require('path');
    const quote = _engineRef.expandQuote(config);
    const doc = buildDocument(quote);
    const buffer = await Packer.toBuffer(doc);
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outputPath, buffer);
    return { outputPath, size: buffer.length };
  }

  // Browser: 回傳 Blob 給 a[download]
  async function buildBlob(config) {
    if (!_engineRef) throw new Error('呼叫 QuoteBuilder.setEngine(engine) 先');
    const quote = _engineRef.expandQuote(config);
    const doc = buildDocument(quote);
    return await Packer.toBlob(doc);
  }

  function setEngine(engineInstance) {
    _engineRef = engineInstance;
  }

  return { buildWord, buildBlob, buildDocument, setEngine };
}));
