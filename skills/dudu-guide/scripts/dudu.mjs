#!/usr/bin/env node
import {readFile, writeFile, mkdir, cp, stat, realpath, readdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve, dirname, join, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validatePack} from '../assets/workbench/core.mjs';

const skill = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [command, ...args] = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`--${name} 需要一个值`);
  return args[index + 1];
}
async function readPack(path) {
  const pack = JSON.parse(await readFile(path, 'utf8'));
  const errors = validatePack(pack);
  if (errors.length) throw new Error(errors.join('\n'));
  return pack;
}
async function main() {
  if (command === 'init') {
    const output = resolve(option('output', 'output/my-park'));
    const pack = await readPack(resolve(option('pack', join(skill, 'assets/demo-park.json'))));
    const name = option('name');
    if (name) pack.name = name;
    const renamedErrors = validatePack(pack);
    if (renamedErrors.length) throw new Error(renamedErrors.join('\n'));
    try { await stat(output); throw new Error(`目标目录已存在：${output}。请选择新目录，避免覆盖已有游园数据。`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await mkdir(dirname(output), {recursive: true});
    await mkdir(output);
    const template = join(skill, 'assets/workbench');
    // Keep the exclusive mkdir above. Older Node versions reject copying the
    // template directory onto that existing directory with errorOnExist.
    for (const entry of await readdir(template)) {
      await cp(join(template, entry), join(output, entry), {recursive: true, force: false, errorOnExist: true});
    }
    await cp(join(skill, 'LICENSE'), join(output, 'LICENSE'), {force: false, errorOnExist: true});
    await writeFile(join(output, 'pack.json'), JSON.stringify(pack, null, 2) + '\n', {flag: 'wx'});
    await writeFile(join(output, '.gitignore'), '.env\n.env.*\nprivate/\n*.log\n', {flag: 'wx'});
    const shellQuote = value => "'" + value.replaceAll("'", "'\\''") + "'";
    console.log(`已生成：${output}\n地点：${pack.name}\n模式：${pack.mode === 'demo' ? '虚构演示（改名不会变成真实地点资料）' : '真实地点（需自行核验资料）'}\n启动（POSIX shell）：node ${shellQuote(fileURLToPath(import.meta.url))} serve --dir ${shellQuote(output)}`);
  } else if (command === 'validate') {
    const path = option('pack');
    if (!path) throw new Error('需要 --pack <地点包.json>');
    const pack = await readPack(resolve(path));
    console.log(`有效：${pack.name} · ${pack.nodes.length} 个节点 · ${pack.facts.length} 条事实。结构校验不代表事实或通行条件已核实。`);
  } else if (command === 'serve') {
    const directory = await realpath(resolve(option('dir', 'output/my-park')));
    await readPack(join(directory, 'pack.json'));
    const port = Number(option('port', '4173'));
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('端口需为 1024–65535 的整数');
    const mime = {'.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml'};
    // Serve only the public workbench files, even if the user adds private files later.
    const publicFiles = new Set(['index.html', 'styles.css', 'app.mjs', 'core.mjs', 'pack.json']);
    const server = createServer(async (req, res) => {
      try {
        if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
        if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(req.headers.host)) { res.writeHead(403); res.end(); return; }
        const pathname = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${port}`).pathname);
        const name = pathname === '/' ? 'index.html' : pathname.slice(1);
        if (!publicFiles.has(name)) { res.writeHead(404); res.end(); return; }
        const path = await realpath(join(directory, name));
        if (!path.startsWith(directory + sep)) { res.writeHead(403); res.end(); return; }
        const data = await readFile(path);
        res.writeHead(200, {'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});
        res.end(req.method === 'HEAD' ? undefined : data);
      } catch { res.writeHead(404); res.end(); }
    });
    server.on('error', error => { console.error(error.message); process.exitCode = 1; });
    server.listen(port, '127.0.0.1', () => console.log(`Dudu 工作台：http://127.0.0.1:${port}\n只监听本机，不调用模型。Ctrl+C 停止。`));
  } else {
    console.log('Dudu Guide v0.1.0\n  init --output <新目录> [--pack <地点包.json>] [--name <名称>]\n  validate --pack <地点包.json>\n  serve --dir <生成目录> [--port 4173]\nNode.js 20+；无第三方依赖。');
    if (command && !['--help', '-h', 'help'].includes(command)) process.exitCode = 1;
  }
}
main().catch(error => { console.error(`Dudu: ${error.message}`); process.exitCode = 1; });
