// 待发布页保活脚本（常驻跑）：防止 bsk 对无人触摸的 task 页做闲置回收（实测约 10 分钟）。
//   node scripts/keep-alive.mjs <session1> [session2 ...]
// 每 4 分钟对每个会话 cooperate sync 一次；会话失效（用户已发布/关闭）自动从名单剔除；
// 全部失效即退出。配合填写完成后的「待你发布」窗口使用，最多保 3 小时。
process.env.BSK_AUTO_START = '0';
const { exec } = await import('../lib/bsk.js');

const sessions = process.argv.slice(2);
if (!sessions.length) { console.error('用法：node scripts/keep-alive.mjs <session1> [session2 ...]'); process.exit(2); }
console.log(`[保活] ${sessions.length} 个会话，每 4 分钟 sync，最多 3 小时（Ctrl+C 停止）`);

const deadline = Date.now() + 3 * 3600 * 1000;
const alive = new Set(sessions);

const timer = setInterval(async () => {
  if (Date.now() > deadline) { console.log('[保活] 3 小时到，退出'); clearInterval(timer); process.exit(0); }
  for (const s of [...alive]) {
    const r = await exec(['cooperate', 'sync', '--session', s, '--json'], { timeout: 30000 }).catch(() => ({ code: 1 }));
    if (r.code !== 0) { alive.delete(s); console.log(`[保活] ${s} 已失效，移出名单`); }
  }
  if (!alive.size) { console.log('[保活] 全部会话已失效，退出'); clearInterval(timer); process.exit(0); }
  console.log(`[保活] tick OK（${alive.size} 个会话）`);
}, 4 * 60 * 1000);
