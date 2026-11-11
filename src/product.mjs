import { normalizeStock } from "./stock.mjs";
import { normalizeProductImages } from "./images.mjs";

export const EXCLUDED_PRODUCT_NAME_KEYWORDS = Object.freeze(["邀请额度增加", "镜像", "中转"]);

function normalizeProductName(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

export function findExcludedProductNameKeyword(name) {
  const normalizedName = normalizeProductName(name);
  return EXCLUDED_PRODUCT_NAME_KEYWORDS.find((keyword) => normalizedName.includes(normalizeProductName(keyword))) || null;
}

export function validateProduct(item, source) {
  if (!item || typeof item !== "object") throw new Error(`${source.name}: invalid product`);
  const goodsKey = String(item.goods_key ?? "").trim();
  const name = String(item.name ?? "").trim();
  const price = Number(item.price);
  const stock = normalizeStock(item.extend);
  if (!goodsKey || !name || !Number.isFinite(price) || price < 0) throw new Error(`${source.name}: invalid product key/name/price/stock`);
  const link = new URL(String(item.link || source.shop_url), source.shop_url);
  if (!["http:", "https:"].includes(link.protocol)) throw new Error(`${source.name}: invalid product link`);
  return {
    ...item,
    ...normalizeProductImages(item, source.shop_url),
    goods_key: goodsKey,
    name,
    price,
    link: link.href,
    extend: { ...item.extend, stock_count: stock.quantity ?? 0, stock_availability: stock.availability, stock_quantity: stock.quantity },
  };
}
