import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {createServer, request} from 'node:http';
import {fileURLToPath} from 'node:url';
const cli = fileURLToPath(new URL('../skills/dudu-guide/scripts/dudu.mjs', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [cli, ...args], {encoding:'utf8'});

test('generated starter validates, keeps demo label when renamed, and refuses to overwrite', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dudu-cli-'));
  try {
    const output = join(tmp, 'new park');
    const generated = run('init','--output',output,'--name','测试工作台');
    assert.equal(generated.status,0,generated.stderr);
    const p = JSON.parse(await readFile(join(output,'pack.json'),'utf8'));
    assert.equal(p.mode,'demo'); assert.equal(p.name,'测试工作台');
    assert.equal(run('validate','--pack',join(output,'pack.json')).status,0);
    const original = await readFile(join(output,'pack.json'),'utf8');
    assert.equal(run('init','--output',output).status,1);
    assert.equal(await readFile(join(output,'pack.json'),'utf8'), original);
    assert.equal(run('init','--pack',join(tmp,'missing.json'),'--output',join(tmp,'fail')).status,1);
  } finally { await rm(tmp,{recursive:true,force:true}); }
});

test('local server serves only public workbench files and rejects external hosts, writes and symlinks', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dudu-server-'));
  let child;
  try {
    const output = join(tmp,'site');
    const generated = run('init','--output',output);
    assert.equal(generated.status,0,generated.stderr);
    await writeFile(join(output,'.env'),'PRIVATE_TEST_DATA');
    await writeFile(join(tmp,'outside.css'),'PRIVATE_TEST_DATA');
    const portProbe = createServer();
    await new Promise(resolve => portProbe.listen(0,'127.0.0.1',resolve));
    const port = portProbe.address().port;
    await new Promise(resolve => portProbe.close(resolve));
    child = spawn(process.execPath,[cli,'serve','--dir',output,'--port',String(port)],{stdio:['ignore','pipe','pipe']});
    await new Promise((resolve,reject) => {
      const timeout = setTimeout(() => reject(new Error('server startup timeout')),5000);
      child.stdout.once('data',()=>{clearTimeout(timeout);resolve();});
      child.once('exit',code=>{clearTimeout(timeout);reject(new Error(`server exited: ${code}`));});
    });
    const get = (path,options={}) => new Promise((resolve,reject) => {
      const req = request({hostname:'127.0.0.1',port,path,...options},res=>{
        let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));
      });req.on('error',reject);req.end();
    });
    const index=await get('/'); assert.equal(index.status,200); assert.ok(index.body.includes('Dudu'));
    assert.ok(index.headers['content-security-policy'].includes("connect-src 'self'"));
    assert.equal((await get('/pack.json')).status,200);
    assert.equal((await get('/.env')).status,404);
    assert.equal((await get('/../outside.css')).status,404);
    assert.equal((await get('/pack.json',{method:'POST'})).status,405);
    assert.equal((await get('/',{headers:{Host:'attacker.example'}})).status,403);
    assert.equal((await get('/',{method:'HEAD'})).body,'');
    await rm(join(output,'styles.css')); await symlink(join(tmp,'outside.css'),join(output,'styles.css'));
    assert.equal((await get('/styles.css')).status,403);
  } finally {
    if(child && child.exitCode === null) { child.kill(); await new Promise(resolve=>child.once('exit',resolve)); }
    await rm(tmp,{recursive:true,force:true});
  }
});
