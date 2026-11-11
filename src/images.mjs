const imageFields = [
  "imageUrl", "images", "image", "cover", "coverImage", "image_url",
  "image_urls", "thumbnail", "thumb", "pic",
];

// Keep image addresses only. The local collector never downloads image files.
export function normalizeProductImages(item, baseUrl) {
  const images = new Set();
  function add(value) {
    if (Array.isArray(value)) return value.forEach(add);
    if (value && typeof value === "object") return add(value.url ?? value.src ?? value.image_url);
    if (typeof value !== "string" || !value.trim()) return;
    const text = value.trim();
    if (text.startsWith("[")) {
      try { return add(JSON.parse(text)); } catch { return; }
    }
    try {
      const url = new URL(text, baseUrl);
      if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) images.add(url.href);
    } catch { /* Ignore malformed image addresses. */ }
  }
  const records = typeof item?.imageUrl === "string" && Array.isArray(item?.images) ? [item] : [item, item?.raw];
  for (const record of records) {
    if (!record || typeof record !== "object") continue;
    for (const field of imageFields) add(record[field]);
  }
  return { imageUrl: [...images][0] || "", images: [...images] };
}
