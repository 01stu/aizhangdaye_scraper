import { dujiaoAdapter } from "./dujiao.mjs";
import { erciyuanAdapter } from "./erciyuan.mjs";
import { genericHtmlAdapter } from "./generic-html.mjs";
import { genericJsonAdapter } from "./generic-json.mjs";
import { liandongAdapter } from "./liandong.mjs";
import { yunmaoAdapter } from "./yunmao.mjs";
import { provider16888Adapter } from "./provider-16888.mjs";

const adapters = new Map(
  [liandongAdapter, yunmaoAdapter, dujiaoAdapter, erciyuanAdapter, provider16888Adapter, genericJsonAdapter, genericHtmlAdapter].map((adapter) => [
    adapter.key,
    adapter,
  ]),
);

export function getAdapter(provider) {
  const adapter = adapters.get(provider);
  if (!adapter) throw new Error(`Unsupported provider: ${provider}`);
  return adapter;
}
