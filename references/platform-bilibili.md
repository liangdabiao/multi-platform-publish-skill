# B站适配细节（member.bilibili.com）

## 页面结构

- 稿件表单在 **micro-app（`micro-app[name=video-up]`）微前端**里：CSS 选择器在主文档 querySelector 查不到，
  read/get-html 的 --selector 也穿不进——**全部操作走 VOM ref**（cooperate sync 后 aria 树里可见）。
- 上传入口：可见按钮「选择文件」（VOM 名字段精确匹配）；隐藏 input 不吃 direct upload。
- 表单就绪信号：`input[placeholder="请输入稿件标题"]` 的 placeholder 文本出现在 VOM。
  注意 **wait-for-element 与 cooperate sync 的视图可能不一致**（前者能看到后者抓不到）——统一用
  「轮询 sync + VOM 含特征文本」判定就绪。

## 「继续编辑」弹窗（重要）

B站会把上次未提交的视频记在本地，打开上传页弹遮罩：「本地浏览器存在 1 个未提交的视频 / 继续编辑 / 不用了」。
- **点「继续编辑」= 复用已传视频**（跳过上传直接进表单）——上次上传失败重跑时的正确路径。
- 点「不用了」= 丢弃重传。
- 弹窗不处理的话上传按钮被遮罩盖住，一切 pointer 动作报 covered。

## 填写要点

| 字段 | 方法 | 校验 |
|---|---|---|
| 标题 | fill（placeholder=`请输入稿件标题`）→ 读回 VOM | ≤80 字 |
| 简介 | **heading「简介」后第一个元素**（after 锚定；有内容时 VOM 行名是内容本身）→ fill 整块 | Quill 富文本，≤2000 字 |
| 标签 | 逐个 fill `按回车键Enter创建标签` + press Enter → sync 后查 VOM 有没有 `"标签名"` | ≤10 个，单标签 ≤20 字；B站拒收的（联想无同名）会静默丢弃，要 note |
| 分区 | 控件在 micro-app 不可见层，**best-effort 尝试后降级人工确认**（别 fail） | 默认「人工智能」可被 publish.json 覆盖 |
| 创作声明 | VOM 里 textbox=`含AI生成内容` 等值；AI 相关内容平台会自动带出 | 必填项，最终由用户确认 |
| 定时 | 「定时发布」开关 → 日历点日期（跨月翻页）→ 时间两列点时/分（**exact 全等匹配数字**，避免撞页面其它数字） | ≥2 小时后，14 天内 |

## 取链接（稿件管理页）

`https://member.bilibili.com/platform/upload-manager/article`——列表行含标题 + BV 号 + 状态
（定时发布/审核中/已发布）+ 时间。按标题匹配行 → BV 号拼 `https://www.bilibili.com/video/BVxxx`。

## 采集流量（同页）

管理页行内有「播放/弹幕/点赞/评论/收藏/分享」数据列，正则 `播放([\d,.]+[万亿KMw]?)` 就近提取。
粉丝数：`https://member.bilibili.com/platform/home` 文本「粉丝 N」。

## 已知坑

- 上传完成判定：body 文本含「上传完成」（上传中会有百分比/速度行）。
- 封面：编辑器要渲染画布，后台标签页做不成——建议引导用户手动传，或短暂切前台。
- 草稿混入：点「继续编辑」会带出上次会话的全部内容（包括用户之前传的其它视频）——
  发正式内容前提醒用户检查 B站草稿箱。
