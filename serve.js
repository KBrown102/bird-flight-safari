const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = process.cwd();
const START_PORT = 8124;
const MAX_PORT = 8200;

function findBrowser() {
    const localAppData = process.env.LOCALAPPDATA || '';
    const candidates = [
        path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    return null;
}

function startServer(port) {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const urlPath = req.url.split('?')[0];
            if (urlPath === '/__ping') {
                res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
                res.end('pong');
                updatePing();
                return;
            }
            if (urlPath === '/__close') {
                res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
                res.end('bye');
                shutdown('page-closed');
                return;
            }

            let f = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath.slice(1));
            const fp = path.join(ROOT, f);
            fs.readFile(fp, (err, data) => {
                if (err) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('not found');
                    return;
                }
                const ext = path.extname(fp).toLowerCase();
                const ct = ext === '.html' ? 'text/html; charset=utf-8'
                    : ext === '.js' ? 'application/javascript'
                    : ext === '.css' ? 'text/css'
                    : 'application/octet-stream';
                res.writeHead(200, { 'Content-Type': ct, 'Access-Control-Allow-Origin': '*' });
                res.end(data);
            });
        });
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                server.close();
                reject(err);
            } else {
                reject(err);
            }
        });
        server.listen(port, '127.0.0.1', () => resolve({ server, port }));
    });
}

async function findPort() {
    let port = START_PORT;
    while (port <= MAX_PORT) {
        try {
            return await startServer(port);
        } catch (e) {
            if (e.code === 'EADDRINUSE') {
                port++;
            } else {
                throw e;
            }
        }
    }
    throw new Error(`端口 ${START_PORT}~${MAX_PORT} 全被占用，请关闭其他实例后再试。`);
}

let browserProc = null;
let tmpDir = null;
let heartbeatTimer = null;
let lastPing = Date.now();
let shuttingDown = false;

function updatePing() {
    lastPing = Date.now();
}

function openBrowser(url, browserPath) {
    tmpDir = path.join(ROOT, '.browser_tmp', Date.now().toString());
    fs.mkdirSync(tmpDir, { recursive: true });
    browserProc = spawn(browserPath, [
        `--user-data-dir=${tmpDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-popup-blocking',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--new-window',
        url,
    ], { detached: false, stdio: 'ignore', windowsHide: false });

    browserProc.on('close', () => {
        browserProc = null;
        shutdown('browser-closed');
    });
}

function startHeartbeat() {
    heartbeatTimer = setInterval(() => {
        if (Date.now() - lastPing > 8000) {
            shutdown('heartbeat-timeout');
        }
    }, 2500);
}

function shutdown(reason) {
    if (shuttingDown) return;
    shuttingDown = true;
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
    if (browserProc) {
        try { browserProc.kill(); } catch (e) {}
        browserProc = null;
    }
    if (tmpDir) {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    }
    console.log(`[${reason}] 服务关闭，清理完成。`);
    process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

async function main() {
    const noBrowser = process.argv.includes('--no-browser');
    const { port } = await findPort();
    console.log(`\n飞鸟 · 无限天际 本地服务已启动`);
    console.log(`访问地址：http://localhost:${port}/`);

    if (noBrowser) {
        console.log('当前为无浏览器模式，按 Ctrl+C 关闭服务。\n');
        return;
    }

    const browserPath = findBrowser();
    let url = `http://localhost:${port}/?server=1`;

    if (browserPath) {
        console.log(`使用浏览器：${browserPath}`);
        openBrowser(url, browserPath);
        startHeartbeat();
        console.log('页面关闭或服务关闭会自动联动退出。按 Ctrl+C 关闭服务。\n');
    } else {
        console.log('未找到 Chrome / Edge，请手动用浏览器打开上方地址。');
        spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' });
    }
}

main().catch(err => {
    console.error(err.message || err);
    process.exit(1);
});
