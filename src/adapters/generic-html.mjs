import * as cheerio from "cheerio";
import { absoluteUrl, numberValue, stableKey } from "../value.mjs";
import { normalizeProductImages } from "../images.mjs";

function objectConfig(source) {
  if (!source.config_json) return {};
  try {
    const parsed = JSON.parse(source.config_json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    throw new Error(`${source.name}: config_json is invalid JSON`);
  }
}

function readField($, item, specification, fallback = "") {
  if (!specification) return fallback;
  const spec = typeof specification === "string" ? { selector: specification } : specification || {};
  const node = spec.selector ? $(item).find(spec.selector).first() : $(item).first();
  if (!node.length) return fallback;
  if (spec.attr) return String(node.attr(spec.attr) || fallback).trim();
  return node.text().trim() || fallback;
}

function readLink($, item, specification, fallback) {
  if (!specification) return fallback;
  const spec = typeof specification === "string" ? { selector: specification } : specification;
  const node = spec.selector ? $(item).find(spec.selector).first() : $(item).first();
  if (!node.length) return fallback;
  return String(node.attr(spec.attr || "href") || node.text() || fallback).trim();
}

function normalized(source, config, $, item, index, pageUrl) {
  const fields = config.fields || {};
  const link = absoluteUrl(readLink($, item, fields.link, source.shop_url), source.shop_url);
  const name = readField($, item, fields.name);
  const key = readField($, item, fields.key, "") || link || name || String(index);
  const imageSpec = fields.images || fields.image;
  const spec = typeof imageSpec === "string" ? { selector: imageSpec } : imageSpec || { selector: "img" };
  const nodes = spec.selector ? $(item).find(spec.selector) : $(item);
  const images = nodes.toArray().map((node) => spec.attr
    ? $(node).attr(spec.attr)
    : $(node).attr("data-src") || $(node).attr("data-original") || $(node).attr("src"));
  return {
    goods_key: `${config.keyPrefix || "generic-html"}-${stableKey(key)}`,
    name,
    ...normalizeProductImages({ images }, pageUrl),
    price: numberValue(readField($, item, fields.price)),
    market_price: numberValue(readField($, item, fields.marketPrice, readField($, item, fields.price))),
    link,
    description: readField($, item, fields.description),
    extend: { stock_count: numberValue(readField($, item, fields.stock)) },
    category: { name: readField($, item, fields.category) },
    raw: $(item).toString(),
  };
}

export const genericHtmlAdapter = {
  key: "generic-html",
  async *collect(source, context) {
    const report = context.report || (async () => {});
    const config = objectConfig(source);
    if (config.render === "browser") throw new Error(`${source.name}: browser HTML rendering is not supported by this collector`);
    if (typeof config.itemSelector !== "string" || !config.itemSelector.trim()) {
      throw new Error(`${source.name}: generic HTML itemSelector is required`);
    }
    const maxPages = Number(config.pagination?.maxPages || context.maxPages);
    const visited = new Set();
    let url = new URL(config.endpoint || source.shop_url, source.shop_url);
    for (let page = 1; page <= Math.min(maxPages, context.maxPages); page++) {
      if (visited.has(url.href)) throw new Error(`${source.name}: generic HTML pagination repeated a URL`);
      await report("fetching_page", `正在抓取第 ${page} 页 HTML`, { page, url: url.href });
      visited.add(url.href);
      const response = await context.http.request(url.href, {
        headers: { accept: "text/html,application/xhtml+xml", ...(config.headers || {}) },
      });
      const html = await response.text();
      const $ = cheerio.load(html);
      const items = $(config.itemSelector).toArray();
      await report("page_fetched", `第 ${page} 页已解析 ${items.length} 个商品`, {
        page,
        itemCount: items.length,
      });
      for (let index = 0; index < items.length; index++) {
        const item = normalized(source, config, $, items[index], index, url.href);
        if (!item.name) throw new Error(`${source.name}: HTML item has no name`);
        yield item;
      }
      const nextSelector = config.pagination?.nextSelector;
      if (!nextSelector) return;
      const next = $(nextSelector).first().attr("href");
      if (!next) return;
      url = new URL(next, url.href);
    }
    throw new Error(`${source.name}: generic HTML exceeded ${context.maxPages} pages`);
  },
};
