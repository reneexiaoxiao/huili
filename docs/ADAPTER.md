# 接入契约

## 架构

```text
用户自己的资料与授权
        ↓
当前 Agent：读取 → 核对证据 → 提案 → 获授权后执行 → 回读
        ↕
用户自己的存储与认证后端
        ↕
会里前端（client/，shared/ 是字段约定）
```

本仓库未包含完整认证/数据库后端。前端可以先被借鉴；要持续使用，请由接手 Agent 实现这些边界。不要复制别人的实例、事件监听或配对配置。

## 前端接口

`client/src/api/index.ts` 是调用清单，`shared/api.interface.ts` 与 `shared/project.interface.ts` 是请求/返回类型。`client/src/lib/transport.ts` 使用同源 `fetch`，浏览器只携带本人会话凭证，服务端逐请求鉴权。

| 方法与路径 | 数据与行为 |
| --- | --- |
| GET `/api/hub/overview?from=...&to=...` | `MeetingHubOverview`，范围内本人会议、计数与连接状态 |
| GET `/api/hub/series` | `MeetingSeriesReadResponse`，系列、作品与对应会议 |
| GET `/api/hub/actions` | `MeetingActionInbox`，本人行动 |
| GET `/api/hub/projects` | `ProjectCatalog`，项目、来源、责任、时间与收录范围 |
| POST `/api/hub/captures` | `CreateCaptureRequest` → `CreateCaptureResponse`；同 `clientRequestId` 返回同记录 |
| POST `/api/hub/captures/:actionId/start` | `StartCaptureResponse`；幂等交接，返回既有或新任务状态 |
| POST `/api/hub/captures/:actionId/reopen` | `ReopenCaptureResponse`；本人随手记撤销完成 |
| POST `/api/hub/actions/:actionId/confirm` | 确认同一行动，队列仅消费已获授权内容 |
| POST `/api/hub/actions/:actionId/complete` | 本人行动完成，必要产物先回读 |
| POST `/api/hub/actions/:actionId/defer` | 稍后处理，保留行动身份 |
| POST `/api/hub/actions/:actionId/cancel` | 取消尚可取消的行动，不能假装回滚已经发生的外部动作 |
| POST `/api/hub/meetings/:meetingId/prepare` | 本人会议准备，区分请求已接受与产物完成 |
| POST `/api/hub/meetings/:meetingId/ai-tasks` | 同请求标识建立会议关联工作 |
| POST `/api/hub/meetings/:meetingId/actions/ignore` | 本人忽略该会议待办，不改变他人业务记录 |
| GET `/api/hub/meetings/ignored` | 已忽略会议摘要 |
| POST `/api/hub/meetings/:meetingId/ignore`、`restore` | 本人视图的隐藏/恢复 |
| PATCH `/api/hub/daily-blank/:id/feedback` | 本件作品的有用/意外/没打中反馈 |
| PATCH `/api/hub/daily-blank/:id/disposition` | 收好、丢弃、丢弃重来和撤销，按类型定义核对取值 |
| POST `/api/hub/daily-blank/:id/save-and-redraw` | 保存当前后申请下一件作品 |
| GET `/api/hub/daily-blank-assets/:fileName` | 本人可访问的短期图片 URL，禁止任意文件读取 |

后端先最小实现一个真实流程，其他能力返回明确不可用。接口字段需要真正校验，不能把前端 TypeScript 类型当运行时验证。

### 必须落实在服务端的约束

- 每个对象归属于认证用户/实例，任何读写都核对归属。浏览器的 `window.userId` 仅用于草稿分区，不能作为后端身份来源。
- 同一来源的稳定主键、同保存请求的幂等键、领取租约、状态的条件更新与执行结果标记均持久化。
- 允许状态转换有明确规则：背景整理完成进入待补充，文档已创建仍需回读，取消不等于外部回滚。
- 责任判断要求引用原文与来源对应；未知、失效或失败的提取不能保留为已确认的紧急责任。
- 链接在后端统一校验，普通产物只允许 HTTPS；可选宿主深链按实际宿主单独允许，拒绝脚本 URL。HTML 必须净化，禁止外部资源与脚本。
- 密钥、原始逐字稿、画像和详细日志在私有存储中；前端环境变量中不存秘密。认证和 CSRF 处理由所选后端负责。

## 可选 MCP / JSON CLI 连接器

需要 **Python 3.10+**。此程序仅按需运行；不安装 CLI、不启动事件监听、不调用模型、不修改宿主配置。

```bash
python3 connector/huili_portable.py --help
python3 connector/huili_portable.py setup --api-base https://huili.example --agent other --dry-run
python3 connector/huili_portable.py --config /private/path/connection.json doctor
python3 connector/huili_portable.py --config /private/path/connection.json mcp
```

无 MCP 时，用 stdin 传 JSON 参数：

```bash
printf '{}' | python3 connector/huili_portable.py --config /private/path/connection.json call huili_status
```

`setup` 会核对本人飞书身份、目标后端与配对信息，保存受限本机配置并生成 MCP 配置文件。需要本人确认账号时返回相应状态；授权按已安装 CLI 的官方方式完成。它不会自动把 MCP 文件导入某个 Agent。

可选连接器要求后端实现以下 POST 路径：

| 路径 | 返回/约束 |
| --- | --- |
| `/openapi/v1/devices/pair` | 一次性配对 → `deviceId`、`deviceToken`，绑定当前用户 |
| `/openapi/v1/series/source` | 本人会议和系列快照；只读检查，不领取工作 |
| `/openapi/v1/meetings/upsert` | 按稳定 `externalKey` 保存已核对会议事实，不能通过此通道上传全文或重写行动 |
| `/openapi/v1/commands/claim` | 仅领取已获授权、未被有效租约占用的行动 |
| `/openapi/v1/commands/progress` | 校验设备、命令、租约、状态与真实产物后回传进展 |

连接器发出 `Authorization: Bearer ...`（若配置了网关密钥）与 `x-device-token`，服务端必须分别校验。它不因工具名称叫“已确认工作”就自动拥有权限。

CLI 支持 `other` 和几个宿主标记；这些是配置标签，不是兼容认证。JSON CLI 与标准输入输出协议均无强制模型依赖。官方参考：[飞书 CLI](https://github.com/larksuite/cli)、[MCP 标准输入输出传输](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)。

## 新版通用字段

公开前端把原宿主专用表达改为 `mode: 'agent'`、`agentFollowup`、`source: 'agent'`。接入已有后端时显式映射字段，不隐式假设旧值兼容。持久任务创建、项目汇总与留白生成应由你的 Agent 能力提供，它们不在六个 MCP 工具里。
