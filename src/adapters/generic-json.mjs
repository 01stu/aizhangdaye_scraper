import { absoluteUrl, getPath, numberValue, stableKey } from "../value.mjs";
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

function setQuery(url, config, page) {
  if (config.pagination?.mode !== "page") return url;
  const pageParam = config.pagination.pageParam || "page";
  const pageSizeParam = config.pagination.pageSizeParam || "page_size";
  const pageSize = Number(config.pagination.pageSize || 100);
  url.searchParams.set(pageParam, String(page));
  url.searchParams.set(pageSizeParam, String(Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 100));
  return url;
}

function normalize(source, config, record, index, pageUrl) {
  const fields = config.fields || {};
  const keyValue = getPath(record, fields.key || "id", `${index}`);
  const name = String(getPath(record, fields.name || "name", "")).trim();
  const link = absoluteUrl(getPath(record, fields.link || "link", source.shop_url), source.shop_url);
  return {
    goods_key: `${config.keyPrefix || "generic-json"}-${stableKey(keyValue)}`,
    name,
    ...normalizeProductImages({
      imageUrl: fields.image ? getPath(record, fields.image) : undefined,
      images: fields.images ? getPath(record, fields.images) : undefined,
      raw: record,
    }, pageUrl),
    price: numberValue(getPath(record, fields.price || "price")),
    market_price: numberValue(getPath(record, fields.marketPrice || "market_price", getPath(record, fields.price || "price"))),
    link,
    description: String(getPath(record, fields.description || "description", "") || ""),
    extend: { stock_count: numberValue(getPath(record, fields.stock || "stock")) },
    category: {
      id: getPath(record, fields.categoryId || "category.id"),
      name: String(getPath(record, fields.categoryName || "category.name", "") || ""),
    },
    raw: record,
  };
}

export const genericJsonAdapter = {
  key: "generic-json",
  async *collect(source, context) {
    const report = context.report || (async () => {});
    const config = objectConfig(source);
    if (config.render === "browser") throw new Error(`${source.name}: browser JSON rendering is not supported by this collector`);
    const method = String(config.method || "GET").toUpperCase();
    if (!["GET", "POST"].includes(method)) throw new Error(`${source.name}: generic JSON method must be GET or POST`);
    const endpoint = new URL(config.endpoint || source.shop_url, source.shop_url).href;
    const pagination = config.pagination?.mode === "page";
    const totalPagesPath = config.pagination?.totalPagesPath || "pagination.total_page";
    const itemsPath = config.itemsPath === undefined ? "data" : config.itemsPath;
    const visited = new Set();

    for (let page = 1; page <= (pagination ? context.maxPages : 1); page++) {
      const url = setQuery(new URL(endpoint), config, page);
      await report("fetching_page", `正在抓取第 ${page} 页`, { page, url: url.href });
      if (visited.has(url.href)) throw new Error(`${source.name}: generic JSON pagination repeated a URL`);
      visited.add(url.href);
      const headers = { accept: "application/json", ...(config.headers || {}) };
      const options = { method, headers };
      if (method === "POST") {
        const body = { ...(config.body || {}) };
        if (pagination) {
          body[config.pagination.pageParam || "page"] = page;
          body[config.pagination.pageSizeParam || "page_size"] = Number(config.pagination.pageSize || 100);
        }
        options.body = JSON.stringify(body);
        headers["content-type"] = headers["content-type"] || "application/json";
      }
      const payload = await context.http.json(url.href, options);
      const records = getPath(payload, itemsPath, itemsPath === "" ? payload : undefined);
      if (!Array.isArray(records)) throw new Error(`${source.name}: generic JSON itemsPath did not resolve to an array`);
      await report("page_fetched", `第 ${page} 页已获取 ${records.length} 个商品`, {
        page,
        itemCount: records.length,
      });
      for (let index = 0; index < records.length; index++) yield normalize(source, config, records[index], index, url.href);
      if (!pagination) return;
      const totalPages = Number(getPath(payload, totalPagesPath));
      if (Number.isFinite(totalPages) && totalPages >= 1) {
        if (page >= totalPages) return;
      } else if (records.length < Number(config.pagination.pageSize || 100)) {
        return;
      }
    }
    throw new Error(`${source.name}: generic JSON exceeded ${context.maxPages} pages`);
  },
};
