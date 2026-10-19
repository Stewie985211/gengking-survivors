import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const host='127.0.0.1',port=4173,url=`http://${host}:${port}`;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
if(!fs.existsSync(path.join(root,'index.html'))){console.error('找不到构建文件。请在项目中执行 pnpm build。');process.exit(1);}
const server=http.createServer((req,res)=>{
  if(req.url==='/__gengking-health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({app:'gengking-survivors',version:1,root}));return;}
  let requestPath;try{requestPath=decodeURIComponent(new URL(req.url,url).pathname);}catch{res.writeHead(400);res.end('Bad request');return;}
  const file=path.resolve(root,'.'+(requestPath==='/'?'/index.html':requestPath));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
  fs.createReadStream(file).pipe(res);
});
server.on('error',async error=>{
  if(error.code==='EADDRINUSE'){
    try{const r=await fetch(url+'/__gengking-health');const info=await r.json();if(info.app==='gengking-survivors'&&info.root===root){console.log('游戏服务已在运行：'+url);openBrowser();process.exit(0);}}catch{}
    console.error(`端口 ${port} 已被其他程序占用。请关闭占用该端口的程序后重试。不会自动结束其他程序。`);
  }else console.error(error.message);
  process.exitCode=1;
});
function openBrowser(){if(process.argv.includes('--no-open'))return;const child=spawn('powershell.exe',['-NoProfile','-Command',`Start-Process '${url}'`],{windowsHide:true,stdio:'ignore'});child.unref();}
server.listen(port,host,()=>{console.log(`梗王幸存者已启动：${url}\n关闭此窗口即可停止游戏服务。`);openBrowser();});
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
