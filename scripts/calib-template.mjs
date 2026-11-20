// 新平台校准脚本模板（node scripts/calib-template.mjs <平台URL> <视频文件>）
// 五步一轮：侦查 → 试错 → 标注 → mock 回归 → 真机复跑（详见 references/debugging-playbook.md）
process.env.BSK_AUTO_START = '0';
const { createBridge, exec } = await import('../lib/bsk.js');
const { startFileBridge } = await import('../lib/filebridge.js');

const URL = process.argv[2];
const FILE = process.argv[3];
if (!URL || !FILE) { console.error('用法：node scripts/calib-template.mjs <平台URL> <视频文件>'); process.exit(2); }

const br = createBridge();
await br.open(URL);
await br.sync();
console.log('[VOM 行数]', br.vomText.split('\n').length);

// ① 侦查：关键词过滤表单结构（按平台改关键词）
for (const l of br.vomText.split('\n')) {
  if (/上传|拖拽|选择文件|标题|正文|描述|话题|标签|发布|定时|textbox|button/.test(l)) console.log('[VOM]', l.trim().slice(0, 140));
}

// ② 账本检查（历史 UNKNOWN 会冻结一切写动作）
const s = await exec(['ledger', 'status', '--json'], { timeout: 20000 }).catch(() => ({ stdout: '{}' }));
const ledger = JSON.parse(s.stdout.slice(s.stdout.indexOf('{'), s.stdout.lastIndexOf('}') + 1) || '{}');
if ((ledger.pending_unknown || []).length) {
  console.log('[账本] frozen:', ledger.frozen, 'pending:', ledger.pending_unknown.length, '—— 确认页面状态后逐个 resolve');
}

// ③ 上传：先试 bsk upload（chooser 拦截），失败走 evaluate 文件桥
const bridge = await startFileBridge(FILE);
console.log('[桥]', bridge.url);
try {
  await br.upload({ text: '上传' }, FILE);   // 按平台改 trigger 文本
  console.log('[upload] chooser 通道 OK');
} catch (e) {
  console.log('[upload] chooser 失败：', e.message.slice(0, 100), '→ 走文件桥');
  try {
    await br.uploadViaEvaluate(FILE);
    console.log('[upload] 结果:', await br.readUploadResult({ timeoutMs: 90000 }));
  } catch (e2) { console.log('[upload] 文件桥失败：', e2.message.slice(0, 120)); }
}

// ④ 侦查上传后的表单结构（新字段从这里抄进适配器）
await br.sync().catch(() => {});
for (const l of br.vomText.split('\n')) {
  if (/标题|正文|描述|话题|标签|定时|textbox|发布/.test(l)) console.log('[表单]', l.trim().slice(0, 140));
}

await bridge.close();
await br.close();
process.exit(0);
