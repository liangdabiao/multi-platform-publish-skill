# 视频号适配细节（channels.weixin.qq.com）

## 页面结构（四平台里最特殊）

- 发表页 `https://channels.weixin.qq.com/platform/post/create`——**wujie 微前端 + shadow DOM 双层**：
  表单全部在 `wujie-app` 的 shadowRoot 里，CSS 选择器完全不可达，**一切操作走两条路**：
  1. **VOM ref**（bsk 的 aria 快照会遍历 shadow root——cooperate sync 后表单元素以 @eN 呈现）
  2. **evaluate 遍历 `el.shadowRoot`**（最可靠：设值+派发事件一步到位）
- 页面有主/子两个 frame（`/micro/content/post/create`），加载慢——sync 会报
  「A page frame is not responding」，**循环重试 sync 直到稳定**（最多 60 秒）。
- 登录态检查：页面顶部有「视频号 · 助手」即已登录；未登录会跳扫码页。
- **权限检查**：手机预览弹窗会提示「当前登录账号不是视频号 X 的管理员或运营者」——这是预览功能的
  提示，**不影响发表**；真正影响的是发表按钮权限。多视频号用户用页面上「切换视频号」切号。

## 「将此次编辑保留?」弹窗（必须处理）

打开发表页会弹「将此次编辑保留?」（上次未发表编辑的恢复提示，按钮在 shadow 里，VOM 不可 ref）。
**用 evaluate 移除 DOM**（比点按钮更可靠）：

```js
(() => {
  let node = null;
  const walk = (root) => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) if (/将此次编辑保留/.test(n.textContent)) node = n;
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot);
  };
  walk(document);
  if (!node) return 'no-dialog';
  let el = node.parentElement;
  for (let k = 0; k < 12 && el; k++) { if (/weui-desktop-dialog/.test(el.className || '')) break; el = el.parentElement; }
  const dialog = el ? (el.closest('.weui-desktop-dialog__wrp') || el) : null;
  const mask = dialog && dialog.parentElement && /mask|wrp/i.test(dialog.parentElement.className || '') ? dialog.parentElement : dialog;
  if (mask) mask.remove();   // 测试/自动化场景直接丢弃旧编辑
  return 'removed';
})()
```

弹窗按钮真实文本是「不保存 / 保存」（不是「保留/不保留」）。要保留的话 fire composed click：
`new MouseEvent('click', { bubbles: true, composed: true, cancelable: true })`。

## 上传（文件桥塞 shadow 里的 input）

1. 移除弹窗遮罩（上一步）。
2. evaluate 遍历 shadow 找 `input[type=file]`（accept 含 video）——页面初始就有。
3. 直塞文件（file-bridge-upload.md 模板）→ change 事件 → 组件开始上传。

## 填写要点（全部 evaluate 直写——bsk fill 的 ref 通道对深层 shadow 不生效）

| 字段 | 方法 | 校验 |
|---|---|---|
| 短标题 | shadow 找 `input[placeholder="填写短标题有机会获得更多流量"]` → 原生 setter + input/change 事件 | **6–16 字**（平台强校验） |
| 描述 | 「添加描述」contenteditable → textContent + input 事件 | ≤1000 字 |
| 话题 | 描述里直接输入「#话题 」文本就会高亮（不需要联想） | 首个放账号名 |
| 封面 | 传完才 editable：个人主页卡片 3:4 + 分享卡片 4:3 两个入口，「直接编辑」→ 传 → 「确认」 | 竖 3:4 + 横 4:3 |
| 定时 | 「定时」单选 → 「请选择发表时间」→ 日历点日期（跨月翻页）→ 「请选择时间」→ 时/分列 exact 点选 | ≥2 小时后 |

设值模板（原生 setter 不触发 React/Vue 的值劫持）：

```js
(() => {
  const found = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll('input, textarea')) {
      if ((el.getAttribute('placeholder') || '').includes('<placeholder 特征>')) found.push(el);
    }
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot);
  };
  walk(document);
  const el = found[0];
  if (!el) throw new Error('input not found');
  const setter = Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set;
  setter.call(el, '<值>');
  el.dispatchEvent(new Event('input',  { bubbles: true, composed: true }));
  el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  return el.value;
})()
```

## 取状态（发表列表页）

`https://channels.weixin.qq.com/platform/post/list`——**视频号作品没有网页链接**，只记状态和时间：
列表项文本匹配描述首行 → 「将于 YYYY年MM月DD日 HH:mm」=定时，否则已发表。

## 采集流量（同页）

列表项的数据项按 svg 类名配对（eyes=播放、outlined-like=赞、comment=评、icon-share=转发）。
粉丝数：`https://channels.weixin.qq.com/platform/statistic/follower` 文本「关注者总数 N」（页面在 shadow 里，
body 文本提取会带上）。

## 已知坑

- sync 的 VOM 每次是分层快照（L1 modal + L2 page）——表单元素偶尔在 L1 聚合按钮的 ctx 里而不在独立行；
  表单字段定位优先 evaluate（不依赖 VOM 形态）。
- 上传完成判定：body 不含「取消上传」。
- 页面加载慢，所有 waitFor 的超时给足（60s）。
