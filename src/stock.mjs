const STOCK_AVAILABILITIES = ["in_stock", "out_of_stock", "unlimited", "unknown"];

export function normalizeStock(extend = {}) {
  const explicit = extend.stock_availability;
  if (explicit != null && !STOCK_AVAILABILITIES.includes(explicit)) throw new Error("Invalid stock availability");
  const value = Object.hasOwn(extend, "stock_quantity") ? extend.stock_quantity : extend.stock_count;
  const quantity = value == null || value === "" ? null : Number(value);
  if (quantity != null && (!Number.isInteger(quantity) || quantity < 0)) throw new Error("Invalid stock quantity");
  const availability = explicit || (quantity > 0 ? "in_stock" : "out_of_stock");
  return {
    availability,
    quantity: availability === "out_of_stock" ? 0 : availability === "unlimited" || availability === "unknown" ? null : quantity,
  };
}
