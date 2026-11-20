// 本地文件桥：evaluate 通道上传的配套服务。
// 背景：Chrome 对跨域/受保护 input 的 CDP DOM.setFileInputFiles 报 Not allowed（抖音/小红书的
// 上传组件都是 FS API 类）；但页面 JS 自己 fetch 本地 HTTP 服务拿字节、new File() 塞 input.files
// 完全合法。本服务只监听 127.0.0.1、只 serve 白名单里的一个文件、带 CORS 头，用完即关。
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { basename } from 'node:path';

export function startFileBridge(filePath, { port = 0 } = {}) {
  const size = statSync(filePath).size;
  const name = basename(filePath);
  const srv = createServer((req, res) => {
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-length': size,
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'cache-control': 'no-store',
    });
    if (req.method === 'OPTIONS') { res.end(); return; }
    if (req.url !== '/' + encodeURIComponent(name)) { res.destroy(); return; }
    const stream = createReadStream(filePath);
    stream.on('error', () => { try { res.destroy(); } catch {} });
    stream.pipe(res);
  });
  return new Promise((resolve) => {
    srv.listen(port, '127.0.0.1', () => {
      const real = srv.address().port;
      resolve({
        url: `http://127.0.0.1:${real}/${encodeURIComponent(name)}`,
        name,
        size,
        close: () => new Promise((r) => srv.close(() => r())),
      });
    });
  });
}
