# 地点包 v1

`pack.json` 是可迁移的地点数据。完整可运行样例在 [demo-park.json](../assets/demo-park.json)。运行时使用 [core.mjs](../assets/workbench/core.mjs) 的 `validatePack()`，CLI 与浏览器共用同一校验逻辑。

## 顶层字段

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `schema_version` | number | 当前为 `1` |
| `id` | string | 小写字母、数字、单连字符；也是本地记录命名空间 |
| `name` | string | 地点显示名称 |
| `mode` | `demo` / `real` | 演示与真实资料的区别 |
| `description` | string | 首屏介绍 |
| `map_note` | string | 解释示意图与路径数据用途、误差和局限 |
| `nodes` | array | 入口、出口与参观点 |
| `edges` | array | 步行连接 |
| `sources` | array | 来源索引 |
| `facts` | array | 与场馆关联的有来源事实；允许空数组 |

## 节点

```json
{
  "id": "canopy",
  "name": "林冠观察站",
  "kind": "venue",
  "status": "open",
  "x": 24,
  "y": 56,
  "stay_minutes": 20,
  "observation_prompts": ["留意高处与低处的枝条，记录不同高度提供的选择。"],
  "not_seen": "暂时没遇见动物，可以先观察环境。不要拍打、呼喊或投喂。"
}
```

这是虚构示例。`kind` 为 `gate` 时不要求停留与观察字段。`status` 为 `open`、`closed` 或 `unknown`；未知地点仍可作为候选，但界面会提醒核实。关闭节点不能作为穿行路径。节点至少包含一个 gate 和一个 venue，ID 唯一。

`x/y` 为 0–100 的**示意布局位置**，不是经纬度；工作台不使用它推算步行距离。真实地点的 `open` 应来自可维护的现场信息；v1 不自动让该字段过期，不适合假装提供实时开放状态。

## 步行边

```json
{
  "from": "south-gate",
  "to": "canopy",
  "minutes": 6,
  "accessible": true,
  "bidirectional": true,
  "basis": "虚构演示步行时间；不是现实道路。"
}
```

- `minutes` 为正数；`bidirectional: false` 表示单向。
- `accessible` 必须明确给布尔值。真实环境中只有核实后才标 true；false 包括「不能确认可无障碍通行」。它不是专业无障碍路线认证。
- 可加 `closed: true` 关闭一条边。
- 真实地点模式下，每条边还需 `source_id` 和有效的 `checked_on: YYYY-MM-DD`，并在 `basis` 解释时间依据。来源记录不等于路径今天仍可通行。
- 断开的节点不会被伪造连接。没有可行出口路径时，规划失败并提示核实现场指示。

## 来源与事实

来源包含 `id`、`title`、`publisher`、`license`、`checked_on`；真实地点还需要 `url`，只接受 HTTP(S)。`license` 可写 `reference-only` 表示仅引用链接，不能据此把原文打包。`checked_on` 是维护者检查来源的日期，不是报道日期。

事实包含：

```json
{
  "id": "canopy-story",
  "venue_id": "canopy",
  "text": "在这个虚构场景里，林冠观察站设置了不同高度的枝条和遮蔽空间。",
  "status": "demo",
  "source_ids": ["original-demo"]
}
```

`status` 为 `demo` 或 `verified`；真实地点不接受 demo 事实。`verified` 是维护者的核验声明，不是软件核验事实真伪的结论。`valid_until` 可选，格式为 `YYYY-MM-DD`，过期事实不进入讲解卡或复制给 Agent 的资料；v1 用 UTC 日期判断，到期日当天仍有效。动物名字、日期、数量、转移经历等需要具体来源，不能只挂一个机构首页。

界面默认最多展示当前场馆前三条未过期事实。Agent 提示词包含该场馆全部未过期事实及对应来源，所以长知识库应先按场馆精选，避免无关内容和过大上下文。

## 个人记录格式

JSON 导出结构：

```json
{
  "schema_version": 1,
  "park_id": "demo-valley",
  "records": [{
    "id": "record-001",
    "venue_id": "canopy",
    "venue_name": "林冠观察站",
    "seen": false,
    "note": "这次没有看见，记下了一个关于空间设计的问题。",
    "recorded_at": "2026-09-05T02:00:00.000Z"
  }]
}
```

记录在当前浏览器、当前网站来源的 `localStorage` 中，以 `dudu:<pack.id>:v1` 命名。换端口、域名或浏览器不会自动同步。相同 ID 导入时保留现有记录，其余合并；不同 `park_id` 拒绝导入。最多 1000 条，每条笔记 2000 字符，导入文件最大 5 MB。改地点包 ID 前先导出备份。

当前工作台按浏览器本地日期排除今天已记录的站点。若同日要二次到访，Agent 可调整规划逻辑；不要删除珍贵记录来规避该规则。
