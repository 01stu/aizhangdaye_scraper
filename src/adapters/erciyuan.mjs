function productStock(product) {
  const value = product.stock;
  const count = value == null || value === "" ? null : Number(value);
  if (count === 0) {
    return { stock_availability: "out_of_stock", stock_quantity: 0, stock_count: 0 };
  }
  // Hidden inventory can be text (e.g. “非常多”); it is not an exact quantity.
  if (Number(product.inventory_hidden) !== 1 && Number.isInteger(count) && count > 0) {
    return { stock_availability: "in_stock", stock_quantity: count, stock_count: count };
  }
  return { stock_availability: "unknown", stock_quantity: null, stock_count: 0 };
}

export function normalizeErciyuanProduct(source, product) {
  if (product?.id == null || String(product.id).trim() === "") {
    throw new Error("Erciyuan product returned invalid id");
  }
  const base = new URL(source.shop_url).origin;
  return {
    goods_key: `erciyuan-${product.id}`,
    name: product.name,
    price: Number(product.price),
    market_price: Number(product.price),
    link: `${base}/item/${encodeURIComponent(product.id)}`,
    description: product.description || "",
    extend: productStock(product),
    category: { id: product.category?.id ?? product.category_id, name: product.category?.name || "" },
    raw: product,
  };
}

export const erciyuanAdapter = {
  key: "erciyuan",
  async *collect(source, context) {
    const report = context.report || (async () => {});
    const base = new URL(source.shop_url).origin;
    const url = `${base}/user/api/index/commodity?categoryId=0`;
    await report("fetching_page", "正在获取全部商品", { page: 1, url });
    const payload = await context.http.json(url, { headers: { accept: "application/json" } });
    if (payload?.code !== 200) throw new Error(payload?.msg || "Erciyuan API failed");
    if (!Array.isArray(payload.data)) throw new Error("Erciyuan API returned invalid data");
    await report("page_fetched", `已获取 ${payload.data.length} 个商品`, {
      page: 1,
      itemCount: payload.data.length,
    });
    for (const product of payload.data) {
      if (Number(product?.hide) === 1 || (product?.status != null && Number(product.status) !== 1)) continue;
      yield normalizeErciyuanProduct(source, product);
    }
  },
};
