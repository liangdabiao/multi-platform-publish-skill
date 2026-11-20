# bsk 协议硬知识（真机实测）

> 来源：2026-11 对 bsk 0.5.0 + BrowserSkill 扩展（协议 1.9）的真机调试。
> bsk CLI 装在 `~/.local/bin/bsk.exe`；daemon 与扩展是两层，CLI 只是客户端。

## 1. 架构与启动

- `bsk daemon start --foreground`：前台常驻 daemon。**放独立终端或开机任务**；在受 Job Object 限制的宿主（AI 工具 shell）后台跑，宿主任务结束 daemon 就死。
- 客户端统一 `BSK_AUTO_START=0`（禁隐式启动，避免抢 daemon）。
- `bsk status --json`：`browsers` 数组为空 = 扩展没连上（让用户点扩展图标重连；daemon 重启后扩展会自动重试，30 秒内）。

## 2. 会话与上下文（cooperate/target 策略，协议 1.9）

- `bsk open <url> --scope <唯一名> --no-focus --json` 返回：`session_id`、`context_id`、`observation_id`、`url`、`vom`（整页 aria 快照文本，@eN ref 都在里面）。
- **scope 必须全局唯一**：同名 scope 二次 open 会被扩展拒绝（即使上个会话已死）。用 `前缀:时间戳36进制:自增` 三段式。
- **open 前先 `bsk close --session <上一个>`**：旧会话的 tab 不归还，新 open 报「A page frame changed; synchronize before choosing this action」。
- open 失败时若返回了 session_id：先 `bsk cooperate sync --session <id>` 重建上下文，再换新 scope 重试一次。
- 之后所有 DOM 动作带 `--session <id> --context <context_id>`；context 会因页面跳变失效，失败信息含 `observation/context/observed_change/stale/coverage` 时 **先 cooperate sync 再重试一次**（只重试一次，不循环）。

## 3. observe（VOM）与元素定位

- VOM 是缩进的 aria 树，每行 `@eN role "可访问名" [ctx: 面包屑长文本] [状态] ="值"`。
- **文本匹配只认第一个引号字段（可访问名）**：`ctx:` 面包屑会包含页面其它所有文本，整行匹配必撞名（点「发布笔记」会命中带「上传视频」面包屑的按钮）。
- **after 锚定要求名字段全等**：`main "发布笔记 首页 … 拖拽视频到此或点击上传 …"` 这种聚合行的名字段包含一切锚文本，包含匹配会让锚提前成立。
- 定位优先级：snapshot ref（@eN）> 可访问名 > CSS 选择器。**micro-app / shadow DOM 里的元素 CSS 选择器查不到**（read/get-html 的 --selector 都穿不进），只能走 ref——先 cooperate sync 让 VOM 覆盖到它。
- input 读回：VOM 行尾 `="值"`；`[empty]` 标记的行先判空再正则（否则会误提取 placeholder 值）。
- 整页文本判断（登录页/上传完成）：直接从 VOM 全文提取引号字段拼接，不要走 read body。

## 4. evaluate（任意 JS，协议 1.9）——最强通道

```sh
bsk evaluate '<script>' --session <id> --context <ctx> --unverified --json
```

- **--unverified 模式**：不比较页面快照，脚本必须**自检前提条件**（弹窗在不在、元素在不在），不在就 throw。适合页面持续动画的场景（视频号/抖音页面永远在动，strict 观察秒过期）。
- 带 `--observation <id>` 的 strict 模式：页面一变就报「observed page changed」——只在页面静止时用。
- evaluate 有 **60 秒固定超时**：大文件 fetch/长轮询不能挤在里面——**fire-and-forget**：脚本只启动异步任务、把结果挂 `window.__xxx`，立即返回；之后轮询另一个 evaluate 读 `window.__xxx`。
- evaluate 每次调用是独立命令，但 `window` 状态跨调用持久（同一 tab）。
- evaluate 能穿透 shadow DOM（自己写 TreeWalker/querySelectorAll 遍历 `el.shadowRoot`）——**这是 wujie/micro-app 类站点的唯一可靠操作方式**。

## 5. 账本冻结（Intent WAL）——「一切被拦」的根源

- mutating 动作（upload/点击提交类）派发后若结果未知，会留下 `state: UNKNOWN` 的 intent；**有 pending UNKNOWN 时账本 `frozen: true`，后续一切写动作被拒**（报 coverage changed / mutating action blocked / permission_denied）。
- 检查：`bsk ledger status --json`。核销：`bsk ledger resolve --operation-id <id>`。
- **核销前必须确认页面没收到那次操作的效果**（如表单没出现=文件没交进去），否则可能重复提交。
- 陈旧的 UNKNOWN（几天前的）直接核销；刚发生的先看页面状态。

## 6. 上传动作纪律

- **mutating 动作绝不重试**：bsk 防重放机制会拦第二次（报 prior tool.upload blocked），且第一次可能已经生效。
- 结果未知（effect_state unknown）时：sync 观察 → 「表单/进度元素出现」= 成功；页面没变 = 失败，可核销账本后换通道重试。
- 上传等待用轮次上限（如 60 轮 × 20s），不用无限 deadline——页面异常时挂死比失败更糟。
- 文件大时 evaluate 里不能同步等 fetch（60s 超时），用 fire-and-forget + 独立轮询（见 file-bridge-upload.md）。

## 7. 常见报错速查

| 报错 | 原因 | 处理 |
|---|---|---|
| A page frame changed; synchronize | 旧会话未归还 / 页面跳变 | close 旧会话；sync 重试一次 |
| This action requires an unused strict observation from cooperate sync | scope 复用或 cooperate 模式未建立 | 换新 scope；open 后先 cooperate sync |
| Page interaction coverage changed | 页面在动 / 账本冻结 | sync + ledger status，冻结则 resolve |
| mutating action blocked: prior tool.upload | 上传防重放 | 不要重试；观察页面结果 |
| The pointer target is covered or unavailable | 弹窗遮罩遮挡 | 找弹窗处理（DOM remove 或点按钮） |
| element not visible (no content quads) | 对 hidden input 直接 upload | 换可见 trigger 按钮，或 evaluate 直塞 |
| This action requires a valid context | context 被页面变化撤销 | cooperate sync 重建 |
| daemon 不能自动启动（Job Object） | 宿主限制 breakaway | 独立终端/开机任务跑 daemon start --foreground |
