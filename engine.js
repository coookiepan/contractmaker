// ============================================================
// DUSKIN 報價引擎核心 (UMD - 瀏覽器與 Node 皆可用)
// ============================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    // Node.js: 自動載入 catalog.json
    const fs = require('fs');
    const path = require('path');
    const defaultCatalog = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'catalog.json'), 'utf-8')
    );
    const api = factory(defaultCatalog);
    api.create = factory;
    module.exports = api;
  } else {
    // 瀏覽器: 用 QuoteEngine.create(catalog) 取得實例
    root.QuoteEngine = { create: factory };
  }
}(typeof self !== 'undefined' ? self : this, function (catalog) {

  // ============================================================
  // 取得單一品項的計算結果
  //
  // 價格定義 (重要!):
  //   catalog.products[code].price 永遠是「每次更換的單價」(含稅)
  //   - cycle=2W: price = 2W 單價，4W 月金額 = price × 2
  //   - cycle=4W: price = 4W 單價，4W 月金額 = price × 1
  //
  // 報價單顯示週期 (item.displayCycle):
  //   - "2W" 顯示 2W 單價
  //   - "4W" 顯示 4W 單價（cycle=2W 商品 × 2 顯示）
  //
  // 折扣優先級（高到低）:
  //   1. item.priceOverride           客戶特殊單價
  //   2. item.discount + 原價          個別品項折扣
  //   3. options.areaDiscount + 原價   區域折扣
  //   4. options.discount + 原價       整體折扣 (限 discountable=true)
  //   5. catalog 原價                  無折扣
  // ============================================================
  function expandItem(item, options) {
    options = options || {};
    const { code, qty, loc, priceOverride, nameOverride,
            displayCycle: itemDisplayCycle, discount: itemDiscount } = item;
    const product = catalog.products[code];
    if (!product) {
      throw new Error('商品代號不存在於 catalog: ' + code);
    }

    const name = nameOverride || product.name;
    const productCycle = product.cycle;
    const displayCycle = itemDisplayCycle || options.defaultDisplayCycle || productCycle;
    const originalPriceBase = product.price;

    if (originalPriceBase == null && priceOverride == null) {
      throw new Error('商品 ' + code + ' catalog 沒有原價，請在 item 提供 priceOverride');
    }

    let pricePerChange;
    let appliedDiscountSource = null;

    if (priceOverride != null) {
      if (productCycle === '2W' && displayCycle === '4W') {
        pricePerChange = priceOverride / 2;
      } else {
        pricePerChange = priceOverride;
      }
      appliedDiscountSource = 'override';
    } else if (itemDiscount != null) {
      pricePerChange = Math.round(originalPriceBase * itemDiscount);
      appliedDiscountSource = 'item';
    } else if (options.areaDiscount != null && product.discountable) {
      pricePerChange = Math.round(originalPriceBase * options.areaDiscount);
      appliedDiscountSource = 'area';
    } else if (options.discount != null && options.discount < 1 && product.discountable) {
      pricePerChange = Math.round(originalPriceBase * options.discount);
      appliedDiscountSource = 'global';
    } else {
      pricePerChange = originalPriceBase;
    }

    const cycleMultiplier = productCycle === '2W' ? 2 : 1;
    const monthly = pricePerChange * cycleMultiplier * qty;
    const monthlyAtOriginal = originalPriceBase != null
      ? originalPriceBase * cycleMultiplier * qty
      : null;

    let displayUnitPrice;
    let displayOriginalPrice;
    if (productCycle === '2W' && displayCycle === '4W') {
      displayUnitPrice = pricePerChange * 2;
      displayOriginalPrice = originalPriceBase != null ? originalPriceBase * 2 : null;
    } else {
      displayUnitPrice = pricePerChange;
      displayOriginalPrice = originalPriceBase;
    }

    let actualDiscount = null;
    let isDiscounted = false;
    if (originalPriceBase != null && pricePerChange !== originalPriceBase) {
      actualDiscount = pricePerChange / originalPriceBase;
      isDiscounted = pricePerChange < originalPriceBase;
    }

    return {
      code,
      name,
      size: product.size,
      productCycle,
      displayCycle,
      cycle: displayCycle,
      qty,
      pricePerChange,
      originalPrice: displayOriginalPrice,
      unitPrice: displayUnitPrice,
      monthly,
      monthlyAtOriginal,
      discount: actualDiscount,
      discountPct: actualDiscount != null
        ? Math.round((1 - actualDiscount) * 100)
        : null,
      discountSource: appliedDiscountSource,
      isDiscounted,
      location: loc || '',
      note: product.note || null,
      _product: product
    };
  }

  function expandArea(area, options) {
    options = options || {};
    const areaOptions = Object.assign({}, options);
    if (area.discount != null) {
      areaOptions.areaDiscount = area.discount;
    }
    const items = area.items.map(it => expandItem(it, areaOptions));
    const subtotal = items.reduce((sum, i) => sum + i.monthly, 0);
    const subtotalAtOriginal = items.reduce(
      (sum, i) => sum + (i.monthlyAtOriginal != null ? i.monthlyAtOriginal : i.monthly), 0
    );
    return {
      name: area.name,
      items,
      subtotal,
      subtotalAtOriginal,
      isDiscounted: items.some(i => i.isDiscounted)
    };
  }

  function expandQuote(config) {
    const options = {
      discount: config.discount || null,
      roundTotalToHundred: config.roundTotalToHundred || false,
      defaultDisplayCycle: config.displayCycle || null,
    };

    let areas;
    if (config.areas) {
      areas = config.areas.map(a => expandArea(a, options));
    } else if (config.items) {
      areas = [expandArea({
        name: config.areaName || '商品明細',
        items: config.items
      }, options)];
    } else {
      throw new Error('config 必須包含 areas 或 items');
    }

    let grandTotal = areas.reduce((sum, a) => sum + a.subtotal, 0);
    const grandTotalAtOriginal = areas.reduce((sum, a) => sum + a.subtotalAtOriginal, 0);

    if (options.roundTotalToHundred) {
      grandTotal = Math.ceil(grandTotal / 100) * 100;
    }

    const overallDiscount = grandTotalAtOriginal > 0 && grandTotal !== grandTotalAtOriginal
      ? grandTotal / grandTotalAtOriginal
      : null;
    const overallSavings = grandTotalAtOriginal - grandTotal;

    const customItems = [];
    for (const area of areas) {
      for (const item of area.items) {
        if (item._product.contractYears) {
          customItems.push({
            code: item.code,
            name: item.name,
            years: item._product.contractYears
          });
        }
      }
    }

    return {
      client: config.client,
      version: config.version,
      date: config.date,
      customerInfo: config.customerInfo || {},
      areas,
      grandTotal,
      grandTotalAtOriginal,
      overallDiscount,
      overallSavings,
      discount: options.discount,
      customItems,
      show: {
        location: config.showLocation !== false,
        stamp: config.showStamp !== false,
        customerNumber: config.showCustomerNumber !== false
      },
      notes: buildNotes(areas, options, customItems, config.extraNotes || [])
    };
  }

  function buildNotes(areas, options, customItems, extraNotes) {
    const notes = [];
    notes.push({ text: "本報價單商品均含 5% 營業稅。" });

    const has2W = areas.some(a => a.items.some(i => i.cycle === '2W'));
    const has4W = areas.some(a => a.items.some(i => i.cycle === '4W'));

    if (has2W && has4W) {
      const uniqueItems = [...new Map(
        areas.flatMap(a => a.items).filter(i => i.cycle === '2W').map(i => [i.code, i])
      ).values()];
      const codes2W = uniqueItems.map(i => `${i.name}（${i.code}）`).join('、');
      notes.push({ text: `更換週期：${codes2W} 每 2 週更換一次，其餘品項每 4 週更換一次。` });
    } else if (has2W) {
      notes.push({ text: `上述商品每 2 週更換一次。` });
    } else {
      notes.push({ text: `上述商品每 4 週更換一次。` });
    }

    if (customItems.length > 0) {
      const uniqueByCode = [...new Map(customItems.map(c => [c.code, c])).values()];
      const list = uniqueByCode.map(c => `${c.name}（${c.code}）`).join('、');
      const years = uniqueByCode[0].years;
      notes.push({
        text: `${list} 為訂製品，合約期間為 `,
        strong: `${years} 年`,
        strongColor: 'C00000',
        tail: '。'
      });
    }

    if (options.discount && options.discount < 1) {
      const discountTenth = options.discount * 10;
      const discountStr = Number.isInteger(discountTenth)
        ? `${discountTenth} 折`
        : `${discountTenth.toFixed(1)} 折`;
      notes.push({
        text: `部分品項享有 `,
        strong: discountStr + '優惠',
        strongColor: 'C00000',
        tail: '，表中顯示為折扣後價格。'
      });
    }

    for (const en of extraNotes) {
      notes.push(typeof en === 'string' ? { text: en } : en);
    }

    return notes;
  }

  function fmt(n) {
    return n.toLocaleString();
  }

  function previewText(config) {
    const q = expandQuote(config);
    const lines = [];
    lines.push(`客戶名稱：${q.client}${q.version ? ` （${q.version}）` : ''}`);
    lines.push(`報價日期：${q.date}`);
    lines.push('');

    for (const area of q.areas) {
      const areaLabel = area.isDiscounted ? `【${area.name}】 ★有折扣` : `【${area.name}】`;
      lines.push(areaLabel);
      for (const it of area.items) {
        let priceCol;
        if (it.isDiscounted) {
          priceCol = `單價 ${fmt(it.unitPrice)}（原價 ${fmt(it.originalPrice)}，省 ${it.discountPct}%）`;
        } else if (it.discountSource === 'override' && it.unitPrice !== it.originalPrice) {
          priceCol = `單價 ${fmt(it.unitPrice)}（原價 ${fmt(it.originalPrice)}）`;
        } else {
          priceCol = `單價 ${fmt(it.unitPrice)}`;
        }
        lines.push(`  ${it.code} ${it.name} × ${it.qty} ${it.cycle}  ${priceCol}  → 月 ${fmt(it.monthly)}` +
                   (it.location ? `  位置: ${it.location}` : ''));
      }
      if (area.isDiscounted) {
        lines.push(`  小計: ${fmt(area.subtotal)}（原價 ${fmt(area.subtotalAtOriginal)}）`);
      } else {
        lines.push(`  小計: ${fmt(area.subtotal)}`);
      }
      lines.push('');
    }

    if (q.overallDiscount != null) {
      const pct = Math.round((1 - q.overallDiscount) * 1000) / 10;
      lines.push(`月金額總合計（每 4 週）：${fmt(q.grandTotal)}`);
      lines.push(`  原價：${fmt(q.grandTotalAtOriginal)}　已優惠：${fmt(q.overallSavings)}（約 ${pct}%，相當於 ${(q.overallDiscount * 10).toFixed(1)} 折）`);
    } else {
      lines.push(`月金額總合計（每 4 週）：${fmt(q.grandTotal)}`);
    }
    lines.push('');
    lines.push('說明：');
    q.notes.forEach((n, i) => {
      let s = `  ${i + 1}. ${n.text || ''}`;
      if (n.strong) s += `[${n.strong}]`;
      if (n.tail) s += n.tail;
      lines.push(s);
    });
    return lines.join('\n');
  }

  return {
    expandQuote,
    expandItem,
    expandArea,
    previewText,
    catalog
  };
}));
