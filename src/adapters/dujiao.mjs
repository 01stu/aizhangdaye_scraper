const pageSize = 100;

function localize(value) {
  if (!value || typeof value !== "object") return String(value || "");
  return value["zh-CN"] || value["zh-TW"] || value["en-US"] || "";
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

function skuHasStock(sku) {
  if (!sku || sku.is_active === false) return false;
  const manualRemaining = Number(sku.manual_stock_total) - Number(sku.manual_stock_sold);
  return positiveNumber(sku.auto_stock_available) || positiveNumber(sku.upstream_stock) ||
    (Number.isFinite(manualRemaining) && manualRemaining > 0);
}

function productPrice(product) {
  const availableSku = Array.isArray(product.skus) ? product.skus.find(skuHasStock) : null;
  const skuPrice = Number(availableSku?.price_amount);
  return Number.isFinite(skuPrice) ? skuPrice : Number(product.price_amount || 0);
}

function productStock(product) {
  if (product.is_sold_out === true || ["out_of_stock", "sold_out"].includes(product.stock_status)) {
    return { stock_availability: "out_of_stock", stock_quantity: 0, stock_count: 0 };
  }
  const value = product.fulfillment_type === "manual" ? product.manual_stock_available
    : product.fulfillment_type === "auto" ? product.auto_stock_available
    : product.auto_stock_available ?? product.manual_stock_available;
  const count = value == null || value === "" ? null : Number(value);
  if (product.stock_status === "unlimited" || (product.fulfillment_type === "manual" && count === -1)) {
    return { stock_availability: "unlimited", stock_quantity: null, stock_count: 0 };
  }
  if (product.stock_quantity_hidden === true || product.stock_display_mode === "hidden" || product.stock_display === "hidden") {
    return { stock_availability: "unknown", stock_quantity: null, stock_count: 0 };
  }
  if (Number.isInteger(count) && count >= 0) {
    return { stock_availability: count > 0 ? "in_stock" : "out_of_stock", stock_quantity: count, stock_count: count };
  }
  return { stock_availability: product.stock_status === "in_stock" ? "in_stock" : "unknown", stock_quantity: null, stock_count: 0 };
}

export function normalizeDujiaoProduct(source, product) {
  const base = String(source.shop_url).replace(/\/$/, "");
  const price = productPrice(product);
  return {
    goods_key: `dujiao-${product.id}`,
    name: localize(product.title),
    price,
    market_price: price,
    link: `${base}/products/${encodeURIComponent(product.slug || product.id)}`,
    description: localize(product.description),
    extend: productStock(product),
    category: { id: product.category?.id, name: localize(product.category?.name) },
    raw: product,
  };
}

export const dujiaoAdapter = {
  key: "dujiao",
  async *collect(source, context) {
    const report = context.report || (async () => {});
    const base = String(source.shop_url).replace(/\/$/, "");
    for (let page = 1; page <= context.maxPages; page++) {
      const url = `${base}/api/v1/public/products?page=${page}&page_size=${pageSize}`;
      await report("fetching_page", `正在抓取第 ${page} 页`, { page, url });
      const payload = await context.http.json(url, { headers: { accept: "application/json" } });
      if (payload?.status_code !== 0) throw new Error(payload?.msg || "Dujiao API failed");
      if (!Array.isArray(payload.data)) throw new Error(`Dujiao page=${page} returned invalid data`);
      await report("page_fetched", `第 ${page} 页已获取 ${payload.data.length} 个商品`, {
        page,
        itemCount: payload.data.length,
        totalPages: Number.isFinite(Number(payload.pagination?.total_page))
          ? Number(payload.pagination.total_page)
          : null,
      });
      for (const product of payload.data) yield normalizeDujiaoProduct(source, product);
      const totalPages = Number(payload.pagination?.total_page);
      if (Number.isFinite(totalPages) && totalPages >= 1) {
        if (page >= totalPages) return;
      } else if (payload.data.length < pageSize) {
        return;
      }
    }
    throw new Error(`Dujiao exceeded ${context.maxPages} pages`);
  },
};
