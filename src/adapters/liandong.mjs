export function createLiandongAdapter(key, origin) {
  const apiBaseUrl = `${origin}/shopApi/Shop`;
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/plain, */*",
    "user-agent": "Mozilla/5.0",
    origin,
    referer: `${origin}/`,
    "x-requested-with": "XMLHttpRequest",
  };
  const pageSize = 100;

  async function callApi(context, path, body) {
    const payload = await context.http.json(`${apiBaseUrl}/${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (payload?.code !== 1) throw new Error(payload?.msg || `${path} failed`);
    return payload.data;
}

return {
  key,
  async *collect(source, context) {
    const report = context.report || (async () => {});
    await report("fetching_categories", "正在获取商品分类", {
      adapter: key,
      endpoint: "categoryList",
    });
    const categories = await callApi(context, "categoryList", {
      token: source.shop_id,
      goods_type: "card",
      category_key: "",
    });
    if (!Array.isArray(categories)) throw new Error("categoryList returned invalid categories");
    await report("categories_fetched", `已获取 ${categories.length} 个商品分类`, {
      categoryCount: categories.length,
    });

    for (const category of categories) {
      let fetched = 0;
      let finished = false;
      for (let page = 1; page <= context.maxPages; page++) {
        await report("fetching_page", `正在抓取分类 ${category.name || category.id} 第 ${page} 页`, {
          categoryId: category.id,
          categoryName: category.name || "",
          page,
        });
        const data = await callApi(context, "goodsList", {
          token: source.shop_id,
          keywords: "",
          category_id: category.id,
          goods_type: "card",
          current: page,
          pageSize,
        });
        if (!Array.isArray(data?.list)) throw new Error(`goodsList category=${category.id} page=${page} returned invalid list`);
        await report("page_fetched", `分类 ${category.name || category.id} 第 ${page} 页已获取 ${data.list.length} 个商品`, {
          categoryId: category.id,
          categoryName: category.name || "",
          page,
          itemCount: data.list.length,
          total: Number.isFinite(Number(data.total)) ? Number(data.total) : null,
        });
        for (const item of data.list) yield { ...item, category };
        fetched += data.list.length;
        const total = Number(data.total);
        if (
          data.list.length === 0 ||
          (Number.isFinite(total) && total >= 0 && fetched >= total) ||
          (!Number.isFinite(total) && data.list.length < pageSize)
        ) {
          finished = true;
          break;
        }
      }
      if (!finished) throw new Error(`goodsList category=${category.id} exceeded ${context.maxPages} pages`);
    }
  },
};
}

export const liandongAdapter = createLiandongAdapter("liandong", "https://wzyp.cn");
