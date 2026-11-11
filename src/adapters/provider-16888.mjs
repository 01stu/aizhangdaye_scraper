const baseUrl = "https://www.16688.com.cn";
const headers = {
  "content-type": "application/json",
  accept: "application/json, text/plain, */*",
  "user-agent": "Mozilla/5.0",
  origin: baseUrl,
  "x-requested-with": "XMLHttpRequest",
};

async function callApi(context, path, body) {
  const payload = await context.http.json(baseUrl + "/shopApi/" + path, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (payload?.code !== 1) throw new Error(payload?.msg || "16888 " + path + " failed");
  return payload.data;
}

export function normalize16888Product(source, product, categories = new Map()) {
  if (!product?.goods_no || !String(product.goods_no).trim()) throw new Error("16888 product returned invalid goods_no");
  const quantity = product.stock_available_quantity == null || product.stock_available_quantity === ""
    ? null : Number(product.stock_available_quantity);
  const knownQuantity = Number.isInteger(quantity) && quantity >= 0 ? quantity : null;
  const availability = product.stock_available_status === "out" || quantity === 0
    ? "out_of_stock"
    : Number.isInteger(quantity) && quantity > 0
      ? "in_stock"
      : ["normal", "low", "high"].includes(product.stock_available_status) ? "in_stock" : "unknown";
  const stockQuantity = availability === "out_of_stock" ? 0 : availability === "in_stock" ? knownQuantity : null;
  const categoryId = product.goods_category_no || "";
  return {
    goods_key: "16888-" + product.goods_no,
    name: product.name,
    price: Number(product.price),
    market_price: Number(product.price),
    link: baseUrl + "/goods/" + encodeURIComponent(product.goods_no),
    description: product.description || "",
    extend: { stock_availability: availability, stock_quantity: stockQuantity, stock_count: stockQuantity ?? 0 },
    category: { id: categoryId, name: categories.get(categoryId) || "" },
    raw: product,
  };
}

export const provider16888Adapter = {
  key: "16888",
  async *collect(source, context) {
    const report = context.report || (async () => {});
    const shopNo = String(source.shop_id || "").trim();
    if (!shopNo) throw new Error("16888 source is missing shop_no");
    await report("fetching_categories", "正在获取商品分类", { adapter: "16888" });
    const categories = await callApi(context, "goodsCategory/list", { shop_no: shopNo });
    if (!Array.isArray(categories)) throw new Error("16888 category API returned invalid data");
    const categoryNames = new Map(categories.map((category) => [String(category.goods_category_no || ""), String(category.name || "")]));
    await report("categories_fetched", "已获取 " + categories.length + " 个商品分类", { categoryCount: categories.length });
    await report("fetching_page", "正在获取全部商品", { page: 1, adapter: "16888" });
    const data = await callApi(context, "goods/list", {
      shop_no: shopNo,
      goods_category_no: "",
      keywords: "",
      sort: "default",
    });
    if (!Array.isArray(data?.list)) throw new Error("16888 goods API returned invalid list");
    await report("page_fetched", "已获取 " + data.list.length + " 个商品", { page: 1, itemCount: data.list.length });
    for (const product of data.list) yield normalize16888Product(source, product, categoryNames);
  },
};
