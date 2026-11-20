# multi-platform-publish-skill

**多平台视频发布 agent skill**：用 [browser-skill（bsk）](https://github.com/Tencent/BrowserSkill) 驱动用户**已登录的本机 Chrome**，把一条剪好的视频自动发布到 **B站 / 小红书 / 抖音 / 视频号** 四平台的创作者后台——自动传视频、填标题正文、选话题、设定时。

**只填写，不点发布。** 最后一下「发布 / 定时发布」永远由用户自己点（防风控的产品底线）。

## 来源

全部技巧来自 2026-11 的真机调试（1120test 四平台实测，每个平台的表单都真实跑通到「待你发布」状态），提炼自 dsh 插件 [liangdabiao/dsh-liang-publish](https://github.com/liangdabiao/dsh-liang-publish) 的适配层。

## 核心技巧（都是踩坑换来的）

1. **通道**：Chrome 136+ 禁 CDP 默认 profile → bsk 扩展通道（cooperate/target 策略 + evaluate --unverified）
2. **上传**：CDP setFileInputFiles 对受保护组件被拒 → **evaluate + 本地文件桥**（页面 JS fetch 字节构造 File 塞 input.files，Chrome 无权拒绝）——四平台通用
3. **shadow/micro-app**：wujie/micro-app 表单 CSS 不可达 → evaluate 遍历 shadowRoot 直写
4. **定位**：bsk VOM 匹配只认可访问名（面包屑会撞名）；读回校验走 VOM 行 `="值"`
5. **防挂死**：upload 绝不重试（防重放）+ 等待轮次上限 + 账本冻结自动核销

## 安装

复制到 agent 的 skills 目录（如 `~/.agents/skills/`），或按所用 harness 的 skill 安装方式引入。前置：

```bash
# 1. 装 bsk CLI（官方安装器）
# 2. 常驻守护（独立终端/开机任务）
bsk daemon start --foreground
# 3. Chrome 装 BrowserSkill 扩展并连接
# 4. 各平台创作者后台登录一遍
```

## 文件结构

```
SKILL.md                        主入口：通道选择/流程/速查表/硬规则
references/
  bsk-protocol.md               bsk 协议硬知识 + 常见报错速查表
  file-bridge-upload.md         evaluate 文件桥上传完整方案（核心技巧）
  platform-bilibili.md          B站：micro-app/继续编辑/标签分区定时
  platform-xhs.md               小红书：input 直塞/标题直写/话题定时
  platform-douyin.md            抖音：点击上传/话题联想/双封面
  platform-channels.md          视频号：shadow 全 evaluate/弹窗移除/短标题
  debugging-playbook.md         调试手册：校准五步循环/mock 回归/报错速查
scripts/
  file-bridge.mjs               本地文件桥服务模块（可直接复用）
  calib-template.mjs            新平台校准脚本模板
```

## License

MIT。方法论源自开源项目 [mdldm-maitian](https://github.com/CzzzzzzJ/mdldm-maitian)（MIT）与 [mdldm-maitian-publisher](https://github.com/CzzzzzzJ/mdldm-maitian-publisher)（Apache-2.0）的实战经验，在此致谢。
