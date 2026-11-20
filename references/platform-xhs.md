# 小红书适配细节（creator.xiaohongshu.com）

## 页面结构

- 发布页 `https://creator.xiaohongshu.com/publish/publish?source=official&target=video` 直接是上传面板
  （无 micro-app/iframe，**CSS 选择器可达**——但 CDP setFileInputFiles 被 coverage 判定拒，上传走文件桥）。
- 上传组件：可见 input[type=file]（accept=.mp4,.mov…）+「拖拽视频到此或点击上传」区域。
- 表单就绪信号：`input[placeholder="填写标题会有更多赞哦"]` 出现在 VOM。
- 「PK 封面」引导弹窗有就点「我知道了」。

## 上传（文件桥直塞）

input 页面加载即存在（可见、enabled），**不用点按钮**，evaluate 直塞（见 file-bridge-upload.md）。
塞入后 change 事件触发上传，面板切到进度视图（「上传中 N%」）。

## 填写要点

| 字段 | 方法 | 校验 |
|---|---|---|
| 标题 | fill → 读回；**读回失败（fill 静默不生效）→ evaluate 直写**（setter+input/change 事件）→ 再读回 | ≤20 字 |
| 正文 | tiptap（.tiptap.ProseMirror）contenteditable：逐行 fill+Enter | ≤1000 字 |
| 话题 | 正文末尾空行后输入「#话题」→ 联想列表点击同名项；**联想点击可能被拒（permission_denied）→ 保留普通文字并 note，不炸流程** | 首个放账号名 |
| 封面 | 传完才 editable：hover 封面 → 「编辑封面」→ 传 cover-3x4 → 「裁剪」→ 3:4 → 「完成」；平台会评估「封面效果评估通过」 | 竖 3:4 |
| 定时 | 「定时发布」开关 → 日期框直接输入 `YYYY-MM-DD HH:mm` + Enter | ≥2 小时后 |

## 标题 evaluate 直写模板（fill 不生效时）

```js
(() => {
  const el = document.querySelector('input[placeholder="填写标题会有更多赞哦"]');
  if (!el) throw new Error('标题框 not found');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(el, '<标题>');
  el.dispatchEvent(new Event('input',  { bubbles: true, composed: true }));
  el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  return el.value;
})()
```

## 取链接（笔记管理页）

`https://creator.xiaohongshu.com/new/note-manager`——**只读页面 DOM，不调它的接口**（风控红线）。
笔记卡片 `.note-card` 的 `data-impression` 属性里埋着 `noteId`（24 位 hex）→ 拼
`https://www.xiaohongshu.com/explore/<noteId>`。状态文本：定时发布/审核中/已发布。
标题在平台改过时，按定时时间字符串兜底匹配（唯一才认）。

## 采集流量（同页）

卡片 stat 顺序：浏览、评论、点赞、收藏、分享（原版同序，逐个 `[\d,.]+[万亿KMw]?` 提取）。
粉丝数：`https://creator.xiaohongshu.com/statistics/fans-data` 文本「粉丝总数 N」。

## 已知坑

- 标题 fill 偶发不生效（React 受控组件吞 programmatic value）——读回校验必须做，失败走 evaluate。
- 上传进度面板出现后表单才可填；「上传中 0%」文本可作为进度信号。
