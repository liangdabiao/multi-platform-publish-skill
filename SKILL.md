---
name: multi-platform-publish
description: 用 browser-skill（bsk）驱动用户已登录的本机 Chrome，把一条剪好的视频自动发布到 B站/小红书/抖音/视频号四平台的创作者后台：自动传视频、填标题正文、选话题、设定时。只填写不点发布，最后一下由用户点。触发词：发布视频、多平台分发、上传到B站、发抖音、发小红书、发视频号、视频发布自动化、创作者后台自动化。
---

# 多平台视频发布 · bsk 本机浏览器自动化

> 适用场景：用户（自媒体博主）剪好一条视频，要发到 B站、小红书、抖音、视频号。
> 本 skill 让 agent 通过 [browser-skill（bsk）](https://github.com/Tencent/BrowserSkill) 扩展通道控制**用户已登录的日常 Chrome**，自动完成各平台创作者后台的填写。
> **安全红线：只填写，不点「发布/定时发布」——最后一下永远由用户自己点。**

## 通道选择（为什么是 bsk）

Chrome 136+ 官方禁止对默认用户目录开 CDP 调试端口——「独立 Chrome + remote-debugging-port」的旧方案会被用户拒绝（登录态在常用 Chrome 里，风控也更容易识别新设备）。**bsk 的扩展通道是唯一能控制用户日常浏览器的方式**：扩展装在用户 Chrome 里，daemon 常驻本地，CLI 通过它操作页面。

前置条件：
1. 用户 Chrome 装好 BrowserSkill 扩展并连接（`bsk status --json` 看 browsers 数组）
2. daemon 常驻：`bsk daemon start --foreground`（放独立终端/开机任务；后台任务里跑会随任务退出而死）
3. 用户已在 Chrome 登录四平台创作者后台
4. 成片 mp4（**必须 faststart**：moov 在文件头，`ffmpeg -c copy -movflags +faststart` 重封装；否则小红书报「无视频流信息」、抖音不出表单）

## 发布流程（按序）

```
① 建工程目录：<root>/<系列>/<期>/，放 成片.mp4 + 封面/cover-*.png（有哪个用哪个）
② 写各平台文案（标题/正文/话题字数规则见 references/platform-*.md）
③ 逐平台开跑（每平台独立会话，跑完一个再下一个——bsk 是单浏览器会话）
④ 各平台「填好就停」→ 提醒用户去点发布
⑤ 到点取链接：开各平台作品管理页按标题匹配，回填状态和链接
```

## 四平台速查表（细节见 references/platform-*.md）

| 平台 | 上传方式 | 表单特点 | 坑 |
|---|---|---|---|
| B站 | 点击「选择文件」+ chooser 拦截 | 表单在 micro-app 里，VOM 可见；Quill 简介编辑器 | 会弹「继续编辑」复用已传视频；标签有联想校验；创作声明必选 |
| 抖音 | click「点击上传」→ **文件桥塞 input** | 标准 input + contenteditable | 话题联想只认真实点击；模型厂商名会被限流 |
| 小红书 | **文件桥直塞 input**（CDP setFileInputFiles 被 coverage 判定拒） | 标准 input + tiptap | 标题 fill 可能不生效→evaluate 直写；封面要等传完 |
| 视频号 | **文件桥直塞 shadow 里的 input** | 全在 wujie shadow DOM，**只能 evaluate 操作** | 「将此次编辑保留?」弹窗要 DOM remove；短标题 6–16 字 |

**上传统一方案：evaluate + 本地文件桥**（scripts/file-bridge.mjs）——CDP 的 DOM.setFileInputFiles 对受保护/跨 frame 的 input 会被 Chrome 拒（`Not allowed`），但页面 JS 自己 fetch 本地服务的字节、`new File()` 塞 `input.files` 完全合法。这是本 skill 的核心技巧，详见 references/file-bridge-upload.md。

## 硬规则（安全与风控）

- **只填写不点发布**。国内四家最后的发布由人点，降低风控风险。
- **同一条视频每个平台只上传一次**。upload 动作绝不重试（bsk 防重放也会拦）；失败先确认页面状态再决定。
- **不做互动自动化**（评论/点赞/私信/关注）。
- 小红书/抖音/视频号正文不放链接、微信号；不写海外模型厂商名（Claude/ChatGPT/Gemini → 用 AI/Agent 代称）。
- 只操作用户自己的账号；自动化在后台 Agent Window 里跑，不抢用户前台。
- bsk 采集/填写时浏览器必须开着；没开着当天跳过，不重试到深夜。

## 工作流要点

1. **填好的页面是交付物，绝不关闭**：填写完成后所有会话/标签页保持打开——用户要在那些页面里点「发布」。抖音/小红书/视频号**没有草稿兜底**，关掉 tab 内容就没了。跑完输出各平台 tab 清单告诉用户去哪点。
2. **保活**：bsk 对无人触摸的页面约 10 分钟闲置回收。「待你发布」期间每 4 分钟对所有会话 `cooperate sync` 一次（最多 3 小时），用 scripts/keep-alive.mjs 或等价循环；保活循环必须在常驻进程里。
3. **每平台跑完整个生命周期再下一家**：预检登录 → open → 填写 → 等上传完成 → 补封面 → 停。预检与填写**复用同一个会话**（预检记录 session/tab，填写切回去），否则每平台会开两个重复 tab。
4. **上传只发一次**；结果未知时用「表单元素出现」确认，而不是重试。
5. **上传等待加轮次上限**（如 60 轮 × 20s），防止页面异常时挂死。
6. 读回校验一律走 bsk 的观察文本（VOM）而非 DOM read（read 的 CSS 查询穿不进 micro-app/shadow）。
7. 遇到「账本冻结」（一切 mutating 被拦）：`bsk ledger status --json` → `bsk ledger resolve --operation-id <id>` 核销（先确认页面没收到文件）。
8. **重跑已到位的平台要显式放行**：防重状态机里「force 跳过提前返回」和「force 跳过已到位过滤」必须同时成立——踩过 force 只跳过前者、后者把平台全部过滤掉，导致静默空跑（run 完成 states 为空）。空 states 的 run 一律视为 bug，不要当成成功。
9. **成功判据 = 状态，绝不是进程存活**：保活/提交进程设计上**永不退出**，绝不能等「后台任务完成」来判断发布进度——每轮只查状态文件（如 发布状态.json / 数据库 tasks 表）或平台页面本身。踩过：盯着一个永不退出的保活进程等了 20 分钟，而四平台早在 10 分钟前就已全部「待你发布」。
10. **风控软拦截识别与处置**：同一视频短时间连续自动化上传（尤其凌晨），四平台会同步出现「上传卡死在百分比/表单不出/假未登录」——这是平台风控软拦截，不是代码 bug。**立即停止重试**（继续硬冲会加重标记），换正常时段（白天）、确认登录态后再跑。

## 文件索引

| 文件 | 内容 |
|---|---|
| [references/bsk-protocol.md](references/bsk-protocol.md) | bsk 协议硬知识：cooperate 令牌、evaluate --unverified、账本冻结、scope 管理、VOM 解析 |
| [references/file-bridge-upload.md](references/file-bridge-upload.md) | evaluate+本地文件桥上传完整方案（含代码），绕过 CDP setFileInputFiles 限制 |
| [references/platform-bilibili.md](references/platform-bilibili.md) | B站适配细节：micro-app、继续编辑、标签/分区/定时 |
| [references/platform-xhs.md](references/platform-xhs.md) | 小红书：input 直塞、标题 evaluate 直写、话题/定时 |
| [references/platform-douyin.md](references/platform-douyin.md) | 抖音：点击上传→塞 input、话题联想真实点击、双封面 |
| [references/platform-channels.md](references/platform-channels.md) | 视频号：wujie shadow 全 evaluate、保留弹窗移除、短标题规则 |
| [references/debugging-playbook.md](references/debugging-playbook.md) | 调试手册：VOM 侦查→mock 回归→校准循环、常见报错速查 |
| [scripts/file-bridge.mjs](scripts/file-bridge.mjs) | 本地文件桥服务模块（直接复用） |
| [scripts/calib-template.mjs](scripts/calib-template.mjs) | 新平台校准脚本模板 |
| [scripts/keep-alive.mjs](scripts/keep-alive.mjs) | 待发布页保活脚本（防 bsk 闲置回收，常驻跑） |
