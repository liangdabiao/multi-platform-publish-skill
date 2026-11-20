# 抖音适配细节（creator.douyin.com）

## 页面结构

- 上传页 `https://creator-micro/content/upload`；「点击上传」按钮可见（VOM @e20）。
- **先 click「点击上传」组件才创建 input[type=file]**（页面初始没有 input）——click 后 evaluate 侦查确认。
- 表单就绪信号：`input[placeholder="填写作品标题，为作品获得更多流量"]` 出现在 VOM。

## 上传（click → 文件桥塞 input）

1. click「点击上传」（真实点击；组件创建 input）。
2. 等 2 秒 → evaluate 直塞文件（见 file-bridge-upload.md；fire-and-forget + 结果轮询）。
3. 上传中 VOM 出现「已上传： N/MMB」+「取消上传」按钮；表单同步出现。

## 填写要点

| 字段 | 方法 | 校验 |
|---|---|---|
| 标题 | fill（placeholder=`填写作品标题，为作品获得更多流量`）→ 读回 | ≤30 字 |
| 正文 | .editor-kit-container[contenteditable=true] 逐行 fill+Enter | ≤1000 字 |
| 话题 | 正文回车后输入「#话题」→ 联想列表（`推荐话题` 锚后）**必须真实点击**（同名单项）→ 没有同名保留普通文字 | ≤5 个；首个放账号名 |
| 封面 | 「选择封面」弹窗：横 4:3 直传、「设置竖封面」页签切换后传 3:4、「完成」 | 弹窗里有两个上传 input，别传错（找「上传封面」文本的那个） |
| 定时 | 「定时发布」单选 → 日期框输入 `YYYY-MM-DD HH:mm` + Enter + **Esc 收起日历** | ≥2 小时后 |

## 话题联想（真实点击）

抖音联想项只认真实输入事件链（bsk click 天然满足）。锚定用「推荐话题」文本之后的匹配项。
没有同名联想项时话题不会生成——保留为普通文字并提示用户（别硬塞）。

## 取链接（作品管理页）

`https://creator.douyin.com/creator-micro/content/manage`——卡片 DOM 里有 `/video/<id>` 链接；
按标题/正文首行匹配。状态：定时发布/审核中/已发布。

## 采集流量（同页）

卡片数据列「播放/点赞/评论/收藏/转发」就近提取。粉丝数：
`https://creator.douyin.com/creator-micro/home` 文本「粉丝 N」。

## 已知坑

- 登录态不稳定（相对四平台掉得快）：每次跑之前预检「扫码登录」字样；掉线提醒用户扫码，20 分钟内补跑。
- 页面持续动画：evaluate 必须 `--unverified` + 脚本自检；动作失败 sync 重试一次。
- 直接写模型/厂商名（Claude/ChatGPT/Gemini…）会被限流——文案用 AI/Agent 代称。
