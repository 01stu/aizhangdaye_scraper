import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { createHttpClient } from "./http.mjs";
import { getAdapter } from "./adapters/index.mjs";
import { findExcludedProductNameKeyword, validateProduct } from "./product.mjs";

function safeName(value) {
  return String(value || "source").normalize("NFKC").replace(/[^\p{L}\p{N}\-_]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "source";
}

export async function loadSources(configPath) {
  const parsed = JSON.parse(await readFile(configPath, "utf8"));
  const sources = Array.isArray(parsed) ? parsed : parsed.sources;
  if (!Array.isArray(sources) || !sources.length) throw new Error("配置文件必须包含非空 sources 数组");
  return sources.map((source, index) => ({
    id: source.id || `source-${index + 1}`,
    name: source.name || source.id || `source-${index + 1}`,
    provider: source.provider || "generic-json",
    shop_url: source.shop_url || source.url,
    shop_id: source.shop_id || "",
    config_json: typeof source.config_json === "string" ? source.config_json : JSON.stringify(source.config || {}),
  }));
}

export async function collectSource(source, { http, maxPages = 100, includeExcluded = false } = {}) {
  if (!source.shop_url) throw new Error(`${source.name}: shop_url is required`);
  const adapter = getAdapter(source.provider);
  const products = [];
  const excluded = [];
  for await (const item of adapter.collect(source, { http, maxPages, report: () => {} })) {
    const keyword = findExcludedProductNameKeyword(item?.name);
    if (keyword && !includeExcluded) { excluded.push({ name: item.name, keyword }); continue; }
    products.push(validateProduct(item, source));
  }
  return { source: { id: source.id, name: source.name, provider: source.provider, shop_url: source.shop_url }, products, excluded };
}

function csvCell(value) {
  const text = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
  return `"${String(text).replaceAll('"', '""')}"`;
}

export function productsToCsv(rows) {
  const columns = ["source_id", "source_name", "provider", "goods_key", "name", "price", "market_price", "link", "imageUrl", "images", "stock_availability", "stock_quantity", "category_id", "category_name", "description", "raw"];
  const lines = [columns.join(",")];
  for (const row of rows) {
    const p = row.product;
    lines.push([
      row.source.id, row.source.name, row.source.provider, p.goods_key, p.name, p.price, p.market_price,
      p.link, p.imageUrl, p.images, p.extend?.stock_availability, p.extend?.stock_quantity,
      p.category?.id, p.category?.name, p.description, p.raw,
    ].map(csvCell).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export async function run({ configPath, outputDir, maxPages = 100, timeoutMs = 15000, retryCount = 2, delayMs = 300, includeExcluded = false }) {
  const sources = await loadSources(configPath);
  await mkdir(outputDir, { recursive: true });
  const http = createHttpClient({ timeoutMs, retryCount, delayMs });
  const results = [];
  for (const source of sources) {
    const startedAt = new Date().toISOString();
    try {
      const result = await collectSource(source, { http, maxPages, includeExcluded });
      const file = `${safeName(source.id)}-${safeName(source.name)}.json`;
      await writeFile(join(outputDir, file), JSON.stringify({ ...result, fetched_at: startedAt }, null, 2) + "\n");
      results.push({ ...result, status: "completed", file });
      console.log(JSON.stringify({ event: "source.completed", source: source.name, count: result.products.length, excluded: result.excluded.length, file }));
    } catch (error) {
      const failure = { source: { id: source.id, name: source.name, provider: source.provider, shop_url: source.shop_url }, status: "failed", error: error instanceof Error ? error.message : String(error) };
      results.push(failure);
      console.error(JSON.stringify({ event: "source.failed", ...failure }));
    }
  }
  const rows = results.flatMap((result) => result.products?.map((product) => ({ source: result.source, product })) || []);
  await writeFile(join(outputDir, "products.json"), JSON.stringify({ generated_at: new Date().toISOString(), products: rows }, null, 2) + "\n");
  await writeFile(join(outputDir, "products.csv"), productsToCsv(rows));
  await writeFile(join(outputDir, "run-summary.json"), JSON.stringify({ generated_at: new Date().toISOString(), config: basename(configPath), results: results.map(({ products, excluded, ...summary }) => ({ ...summary, count: products?.length || 0, excluded: excluded?.length || 0 })) }, null, 2) + "\n");
  return results;
}
