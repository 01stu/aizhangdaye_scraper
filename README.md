# 链动小铺等商品数据采集器

一个面向开发者的链动小铺等商品数据采集工具。项目支持从公开 JSON API 或静态 HTML 页面读取商品信息，经过统一格式化后保存为 JSON 和 CSV 文件，便于数据分析、迁移、备份和二次开发。

采集器采用适配器架构，数据源配置与采集代码分离，支持自定义字段映射、分页、请求方法、请求头和 HTML 选择器。所有数据在本地处理和保存，不需要额外的数据库或远程服务。

## 环境要求

- Node.js 22 或更高版本
- 能够访问目标数据源的网络环境

## 安装与运行

在项目目录中执行：

```bash
npm install
copy config\sources.example.json config\sources.json
# 编辑 config/sources.json，填写数据源地址和字段映射
npm start
```

Windows 使用 `copy`，Linux/macOS 使用 `cp`。默认输出目录为 `output/`：

- `products.json`：所有数据的汇总文件，保留 `raw` 原始记录；
- `products.csv`：适合 Excel、数据库或后续分析；
- 每个数据源一个独立 JSON 文件；
- `run-summary.json`：本次运行的成功、失败和数量摘要。

如果需要定时运行，可以使用操作系统的任务计划、cron 或其他进程调度工具调用同一条命令。

也可以显式指定路径和抓取参数：

```bash
node src/cli.mjs --config config/sources.json --output output --max-pages 100 --timeout-ms 15000 --delay-ms 300
```

默认会过滤商品名包含“邀请额度增加”“镜像”“中转”的记录。需要保留这些记录时，可以加上 `--include-excluded`。

## 数据源配置

每个 `sources` 条目至少需要 `name`、`provider` 和 `shop_url`。可用的内置适配器如下：

| provider | 用途 |
| --- | --- |
| `generic-json` | JSON API，可配置 GET/POST、字段路径和分页 |
| `generic-html` | 静态 HTML，可配置 CSS 商品选择器和下一页链接 |
| `liandong` | 链动小铺，`shop_id` 填店铺 token |
| `yunmao` | 云猫寄售，`shop_id` 填店铺 token |
| `dujiao` | 独角公开商品 API，`shop_url` 填站点根地址 |
| `erciyuan` | 二次元公开商品 API，`shop_url` 填站点根地址 |
| `16888` | 16888 店铺 API，`shop_id` 填店铺编号 |

### 通用 JSON

`generic-json` 适用于返回 JSON 的公开接口。`fields` 用于将上游字段映射为统一商品字段，路径支持点号和数组下标：

```json
{
  "endpoint": "https://shop.example/api/products",
  "method": "GET",
  "itemsPath": "data.items",
  "fields": {
    "key": "id",
    "name": "title",
    "price": "price",
    "link": "detail_url",
    "stock": "inventory",
    "images": "gallery"
  },
  "pagination": {
    "mode": "page",
    "pageParam": "page",
    "pageSizeParam": "page_size",
    "pageSize": 100,
    "totalPagesPath": "meta.total_pages"
  }
}
```

### 通用 HTML

`generic-html` 需要配置 `itemSelector`。字段可以直接使用 CSS 选择器，也可以指定属性，例如 `{ "selector": ".cover", "attr": "data-src" }`。采集器解析服务器返回的 HTML，不执行浏览器 JavaScript；需要登录、验证码或前端渲染的站点需要额外的浏览器自动化方案。

### 自定义适配器

如果目标数据源不符合现有协议，可以在 `src/adapters/` 中新增适配器，并在 `src/adapters/index.mjs` 注册。适配器需要提供唯一的 `key` 和异步 `collect` 方法，逐条返回统一商品对象。

## 数据与请求行为

- 采集器只保存商品数据和图片地址，不下载图片文件。
- 每个请求都有超时、有限重试和按站点限速机制。
- 解析失败会写入标准错误，并继续处理其他数据源；所有数据源都失败时，进程返回非零退出码。
- 采集前应确认目标站点允许公开抓取，并遵守服务条款、robots 规则和适用法律。

## 配置与隐私

不要将包含私有地址、账号信息、访问令牌或其他鉴权信息的配置文件提交到公开仓库。建议只提交 `config/sources.example.json`，并将实际配置另存为 `config/sources.json`。`output/` 已默认加入 `.gitignore`。

## 开源协议

本项目采用 MIT License，详见 [`LICENSE`](LICENSE)。
