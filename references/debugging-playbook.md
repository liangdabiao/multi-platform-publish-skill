# 调试手册：新平台/改版后的校准循环

> 本次四平台真机调试沉淀的方法论。适用于任何「bsk 驱动 web 表单」的自动化。

## 校准循环（五步一轮）

```
① 侦查：open 目标页 → cooperate sync → 打印 VOM 全文，按关键词过滤出表单结构
② 试错：按 VOM 结构写操作序列（fill/click/upload），逐步打印返回与读回
③ 标注：把依赖真机形态的定位器标 ⚠️校准，跑通后固化
④ 回归：把页面结构写成 mock 状态机，离线跑全流程（不碰真实浏览器）
⑤ 复跑：真机重跑全流程，状态机每一步与 mock 对齐
```

### ① 侦查技巧

```js
// VOM 关键词过滤（一次 sync 看全表单）
for (const l of br.vomText.split('\n')) if (/标题|上传|textbox|button|placeholder/.test(l)) console.log(l.trim());
```

- `@layers N` 行看分层：`L1 mask cover=100%` = 有全屏遮罩（先找弹窗）；`L2 … occluded` = 主体被挡。
- 聚合行（main/region 的名字段是整页拼接文本）会包含所有关键词——过滤时注意区分。
- DOM 侦查用 evaluate（含 shadow 遍历），一次返回 JSON 摘要，别反复 get-html（整页 dump 几百 KB）。

### ② 试错原则

- 每个动作打印三样：动作+目标、返回 JSON（截断）、读回值。**读回校验是唯一的成功判据**。
- 失败先看完整 reason（bsk 错误 JSON 里的 `phase`/`reason`/`recovery` 字段比 message 信息量大）。
- 一次只改一个变量。

### ③ 常见「动作失败但页面其实是好的」

| 现象 | 真相 |
|---|---|
| fill 后读回空 | 写进去了但 read 穿不进 micro-app/shadow → 读回改走 VOM 行 `="值"` |
| fill 后读回是 placeholder | `[empty]` 行要先判空再提值（placeholder="X" 也是 ="X" 形态） |
| click 报 covered | 有弹窗遮罩（「继续编辑」「将此次编辑保留」类）；先处理弹窗 |
| upload 报 Not allowed | 组件拒 CDP setFileInputFiles → 走文件桥（file-bridge-upload.md） |
| evaluate 报 observed changed | 页面动画 → --unverified + 脚本自检 |
| 轮询读结果全 fail | context 失效 → 每次失败先 cooperate sync |

### ④ mock 状态机（离线回归基准）

页面 = `{ url, state, elements }`；元素键 = 选择器子串（最长匹配优先）或文本锚。
要点（都是踩过的坑）：

- **元素必须带 text 字段**（文本目标匹配靠它；漏了会「找不到目标」）
- **findEl 文本匹配最短优先**（聚合 body 的长文本也包含按钮文本，会抢匹配导致写错字段）
- upload 元素要触发 effect（如 videoDone=true），否则 uploadDone 永假、等待循环挂死
- 桥的接口与 real 版**同步新增**（sync/evaluate/unfreeze/vomText/...），适配器新增调用点 mock 就地补齐
- mock evaluate 返回 `'null'` 语义 = 通道不可用，适配器应退化到 fill 通道
- 状态机里日期相关用「北京时间约定」（与采集端 dayOf 同源），否则涨粉窗口这类区间查询会错位

### ⑤ 真机复跑验收

全流程跑通后核对四样：每平台状态=「待你发布」、读回校验无 err、上传完成信号出现、管理页 sync 能按标题匹配（未发布返回「未找到」也是正确行为）。

## 工程纪律

- 所有 bsk CLI 细节（参数名/输出解析/报错分类）收在一个桥模块里，适配器只调语义方法（open/fill/click/upload/evaluate/...）——真机校准只改桥，不动适配器。
- mock 页面状态机是回归基准：改桥/改适配器后 `npm test` + `npm run smoke` 必须全绿再上真机。
- 版本固定上游适配快照（如 vendor 校验规则），跟进上游手动 diff。

### 编排层坑（状态机/进程）

- **force/重跑语义要两处同时放行**：「跳过提前 return」和「跳过已到位过滤」缺一不可——踩过 force 只改了前者，后者把平台全过滤掉，run 静默空跑（states 为空却报成功）。**states 为空的 run 一律当 bug 查**。
- **保活循环跑在常驻进程**：一次性脚本里 setInterval 随进程退出而死，保活形同虚设。
- **长任务经管道跑时 node stdout 是块缓冲**：后台任务日志看不到进度，输出落盘文件（`> file.log`）或写库。
- **node -e 里的模板串会被 bash 吃**（`${}` 替换、反引号）——带模板字符串的诊断/校准代码写成脚本文件跑，别塞 -e。
