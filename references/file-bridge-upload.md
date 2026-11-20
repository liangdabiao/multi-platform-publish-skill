# evaluate + 本地文件桥上传（核心技巧）

> 解决的问题：抖音/小红书/视频号的上传组件对 CDP 的 `DOM.setFileInputFiles` 拒绝
> （报 `Not allowed` / `Not allowed by component` / coverage 判定拦），chooser 拦截通道也不稳定。
> 原理：**页面自己的 JS** 从本地 HTTP 服务 fetch 文件字节、`new File()` 构造、`DataTransfer`
> 塞进 `input.files`、派发 change 事件——这是标准 Web API，Chrome 无权拒绝，且对所有平台通用。

## 三步流程

```
① 本地起一次性 HTTP 服务（127.0.0.1 随机端口），只 serve 指定的视频文件，带 CORS 头
② evaluate 注入脚本：页面 JS fetch 文件字节 → new File → DataTransfer → input.files → change
   —— fire-and-forget：fetch 是异步的，脚本把结果挂 window.__liangUploadResult 立即返回
③ 轮询 evaluate 读 window.__liangUploadResult，set:N = 成功；期间 context 失效就 sync 重建
```

## 服务端（scripts/file-bridge.mjs）

见 [scripts/file-bridge.mjs](../scripts/file-bridge.mjs)。要点：
- 只监听 `127.0.0.1` 随机端口；URL 带文件名（`/%E6%88%90%E7%89%87.mp4`）；请求路径不匹配直接断开
- 响应头：`access-control-allow-origin: *`（跨域 https 页面 fetch http://127.0.0.1 需要它；loopback 是
  Chrome 的「potentially trustworthy origin」，mixed content 不拦）
- `content-type: application/octet-stream` + `content-length`；用完 `close()`

## 注入脚本模板

```js
(() => {
  const collect = (root, out) => {
    for (const el of root.querySelectorAll('input[type=file]')) out.push(el);
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) collect(el.shadowRoot, out);  // 视频号 shadow
  };
  const inputs = []; collect(document, inputs);
  const input = inputs.find(i => !i.disabled && /mp4|video/.test(i.accept || '')) || inputs[0];
  if (!input) return 'no-input';

  // fire-and-forget：fetch 立即启动，结果挂 window（evaluate 有 60s 固定超时，不能同步等 14MB）
  window.__liangUpload = fetch('http://127.0.0.1:<port>/<file>').then(r => {
    if (!r.ok) throw new Error('http ' + r.status);
    return r.arrayBuffer();
  }).then(buf => {
    const f = new File([buf], '成片.mp4', { type: 'video/mp4' });
    const dt = new DataTransfer(); dt.items.add(f);
    input.files = dt.files;
    input.dispatchEvent(new Event('input',  { bubbles: true, composed: true }));
    input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    window.__liangUploadResult = 'set:' + input.files.length;
    return window.__liangUploadResult;
  }).catch(e => { window.__liangUploadResult = 'err:' + (e.message || e); return window.__liangUploadResult; });
  return 'started';
})()
```

## 轮询结果

```js
// 每 3 秒一次，context 失效（报 changed/context）就 cooperate sync 重建再读；120 秒兜底超时
const v = await evaluate('window.__liangUploadResult || "pending"');
// v === 'set:1'  → 文件已交进页面，等平台自己的上传进度（表单元素出现确认）
// v.startsWith('err:') → 失败原因；此时账本可能有 UNKNOWN，页面确认没收到后 resolve
```

## 平台差异

| 平台 | input 位置 | 是否需要先点按钮 |
|---|---|---|
| 抖音 | 点击「点击上传」按钮后组件创建 | **要先 click**（click 后 input 才出现在 DOM） |
| 小红书 | 页面加载即有（可见，accept=.mp4…） | 不需要 |
| 视频号 | wujie shadow DOM 里 | 不需要（先移除「将此次编辑保留?」弹窗遮罩） |
| B站 | 隐藏 input + 「选择文件」按钮 | 不需要（chooser 拦截通道就能通，文件桥是备胎） |

## 失败兜底

- evaluate 通道失败 → 引导用户手动拖拽一次，程序轮询「表单元素出现」接管后续填写（表单逻辑与上传方式无关）。
- 失败信息里保留 bsk 原始报错 + evaluate 失败原因，方便定位是组件拒绝还是页面没 input。
