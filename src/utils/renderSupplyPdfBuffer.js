const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const FONT_FILE = path.join(__dirname, "../../fonts/NotoSans-Regular.ttf");

const MAX_GROUP_TITLE = 200;
const MAX_LINE_NAME = 200;
const MAX_LINES_PER_REQUEST = 200;

/**
 * Display-only unit auto-upgrade, mirroring katmitra-app's
 * formatSupplyQuantity: once a gram/millilitre value reaches 1000, show it
 * as kg/ltr instead (e.g. 1500 g -> "1.5 kg"). Units with no defined
 * conversion (pcs, etc.) pass through unchanged. Does not affect the
 * underlying stored quantity/unit, only what's printed on the PDF.
 */
const UNIT_UPGRADES = {
  g: { to: "kg", factor: 1000 },
  ml: { to: "ltr", factor: 1000 },
  l: { to: "ltr", factor: 1000 },
  litre: { to: "ltr", factor: 1000 },
  liter: { to: "ltr", factor: 1000 },
};

function formatQtyNumber(n) {
  const rounded = Math.round((n + Number.EPSILON) * 100) / 100;
  return rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function formatDisplayQty(quantity, unit) {
  const n = Number(quantity) || 0;
  const unitKey = String(unit ?? "").trim().toLowerCase();
  const upgrade = UNIT_UPGRADES[unitKey];
  if (upgrade && Math.abs(n) >= upgrade.factor) {
    return { quantity: formatQtyNumber(n / upgrade.factor), unit: upgrade.to };
  }
  return { quantity: formatQtyNumber(n), unit: String(unit ?? "—") };
}

const PAGE_MARGIN = 48;
const COL_ITEM_W = 340;
const COL_QTY_W = 56;
const COL_UNIT_W = 72;
const ROW_GAP = 6;

/**
 * @param {object} payload
 * @returns {Promise<Buffer>}
 */
function renderSupplyPdfBuffer(payload) {
  return new Promise((resolve, reject) => {
    const groups = Array.isArray(payload.groups) ? payload.groups : [];
    const lineCount = groups.reduce(
      (n, g) => n + (Array.isArray(g?.lines) ? g.lines.length : 0),
      0,
    );
    if (lineCount > MAX_LINES_PER_REQUEST) {
      return reject(
        new Error(`Too many lines (max ${MAX_LINES_PER_REQUEST})`),
      );
    }

    const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const hasFont = fs.existsSync(FONT_FILE);
    if (hasFont) {
      doc.registerFont("App", FONT_FILE);
      doc.font("App");
    } else {
      doc.font("Helvetica");
    }

    const tableLabels = payload.tableLabels || {
      item: "Item",
      qty: "Qty",
      unit: "Unit",
    };

    const documentLabel = String(
      payload.documentLabel || "Supply list",
    ).slice(0, MAX_GROUP_TITLE);
    const heading = String(payload.heading || "Supply").slice(
      0,
      MAX_GROUP_TITLE,
    );
    const subtitle = payload.subtitle
      ? String(payload.subtitle).slice(0, 300)
      : "";
    const companyName = payload.companyName
      ? String(payload.companyName).slice(0, 200)
      : "";

    /**
     * Catering/business header lines shown under the company name — same fixed
     * order and hide-if-empty rules as every client-side PDF
     * (`buildPdfCompanyMetaLines` in the app). Empty fields are dropped so no
     * blank "GST:" line is printed.
     */
    const clip = (v) => String(v == null ? "" : v).trim().slice(0, 200);
    const companyMetaLines = [];
    const addMeta = (value, prefix) => {
      const v = clip(value);
      if (v) companyMetaLines.push(prefix ? `${prefix} ${v}` : v);
    };
    addMeta(payload.companyAddress);
    for (const owner of Array.isArray(payload.companyOwners) ? payload.companyOwners : []) {
      const name = clip(owner?.name);
      if (!name) continue;
      const phone = clip(owner?.phone);
      addMeta(phone ? `${name} (${phone})` : name, "Owner:");
    }
    addMeta(payload.companyPhone, "Phone:");
    addMeta(payload.companyEmail, "Email:");
    addMeta(payload.companyGst, "GST:");

    const pageInnerW = doc.page.width - PAGE_MARGIN * 2;
    const rightBlockW = pageInnerW * 0.62;
    const xRight = PAGE_MARGIN + pageInnerW - rightBlockW;

    let leftBottom = PAGE_MARGIN;
    if (companyName) {
      doc.fontSize(11).fillColor("#0f172a");
      doc.text(companyName, PAGE_MARGIN, PAGE_MARGIN, {
        width: pageInnerW * 0.55,
        lineBreak: true,
      });
      leftBottom = doc.y;
      if (companyMetaLines.length) {
        doc.fontSize(9).fillColor("#64748b");
        doc.text(companyMetaLines.join("\n"), PAGE_MARGIN, doc.y + 2, {
          width: pageInnerW * 0.55,
          lineBreak: true,
        });
        doc.fillColor("#0f172a");
        leftBottom = doc.y;
      }
    }

    doc.fontSize(18).fillColor("#0f172a");
    doc.text(documentLabel.toUpperCase(), xRight, PAGE_MARGIN, {
      width: rightBlockW,
      align: "right",
    });
    doc.fontSize(12);
    doc.text(heading, xRight, doc.y + 4, {
      width: rightBlockW,
      align: "right",
    });
    if (subtitle) {
      doc.fontSize(9).fillColor("#64748b");
      doc.text(subtitle, xRight, doc.y + 4, {
        width: rightBlockW,
        align: "right",
      });
      doc.fillColor("#0f172a");
    }

    let yy = Math.max(doc.y + 20, leftBottom + 20, 124);
    const bottomLimit = doc.page.height - PAGE_MARGIN;

    const xQty = PAGE_MARGIN + COL_ITEM_W + 8;
    const xUnit = xQty + COL_QTY_W + 8;

    function ensureSpace(needed) {
      if (yy + needed > bottomLimit) {
        doc.addPage();
        if (hasFont) doc.font("App");
        else doc.font("Helvetica");
        yy = PAGE_MARGIN;
      }
    }

    for (const g of groups) {
      const title = String(g?.title || "—").slice(0, MAX_GROUP_TITLE);
      const lines = Array.isArray(g?.lines) ? g.lines : [];

      ensureSpace(36);
      doc.fontSize(13).fillColor("#0f172a");
      doc.text(title, PAGE_MARGIN, yy, { width: pageInnerW });
      yy = doc.y + ROW_GAP;

      const hdrTop = yy;
      doc.fontSize(8).fillColor("#94a3b8");
      doc.text(
        String(tableLabels.item).toUpperCase(),
        PAGE_MARGIN,
        hdrTop,
        { width: COL_ITEM_W },
      );
      doc.text(
        String(tableLabels.qty).toUpperCase(),
        xQty,
        hdrTop,
        { width: COL_QTY_W, align: "right" },
      );
      doc.text(
        String(tableLabels.unit).toUpperCase(),
        xUnit,
        hdrTop,
        { width: COL_UNIT_W, align: "right" },
      );
      yy = hdrTop + 14;

      doc.moveTo(PAGE_MARGIN, yy)
        .lineTo(doc.page.width - PAGE_MARGIN, yy)
        .strokeColor("#e2e8f0")
        .lineWidth(0.5)
        .stroke();
      yy += 10;

      doc.fontSize(11).fillColor("#0f172a");

      for (const ln of lines) {
        const name = String(ln?.name ?? "—").slice(0, MAX_LINE_NAME);
        const rawQty = Math.max(0, Math.min(999999, Number(ln?.quantity) || 0));
        const { quantity: qty, unit } = formatDisplayQty(rawQty, ln?.unit);

        const nameH = doc.heightOfString(name, { width: COL_ITEM_W });
        const rowH = Math.max(22, nameH + 6);
        ensureSpace(rowH + 6);

        const rowTop = yy;
        doc.text(name, PAGE_MARGIN, rowTop, { width: COL_ITEM_W });
        doc.text(qty, xQty, rowTop, {
          width: COL_QTY_W,
          align: "right",
        });
        doc.text(unit.slice(0, 32), xUnit, rowTop, {
          width: COL_UNIT_W,
          align: "right",
        });
        yy = rowTop + rowH;
      }

      yy += 12;
    }

    doc.end();
  });
}

module.exports = { renderSupplyPdfBuffer, MAX_LINES_PER_REQUEST };
