// Quady3D AI. Read-only Toolkit discovery; product setup: https://quady3d.com/integrations/mcp
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {homedir} from 'node:os';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
const temp=process.env.RUNNER_TEMP;
const catalog=path.join(homedir(),'.docker/mcp/catalogs/quady3d-fixture.yaml');
await fs.copyFile('catalogs/quady3d/catalog.yaml',catalog);
const config=path.join(temp,'quady3d-toolkit-config.json');
const secrets=path.join(temp,'quady3d-toolkit-fixture.env');
await fs.writeFile(config,JSON.stringify({quady3d:{project_path:path.join(temp,'quady3d-project'),state_path:path.join(temp,'quady3d-state')}}));
await fs.writeFile(secrets,'quady3d.api_key=fixture-placeholder-not-a-real-key\n',{mode:0o600});
// Only this isolated test invocation accepts the unsigned, locally built image.
const child=spawn('docker',['mcp','gateway','run','--servers=quady3d','--catalog='+catalog,'--config='+config,'--secrets='+secrets,'--verify-signatures=false','--watch=false'],{stdio:['pipe','pipe','pipe']});
let stderr='';child.stderr.on('data',b=>{stderr=(stderr+b.toString()).slice(-4000);});
let id=0;const pending=new Map();
createInterface({input:child.stdout}).on('line',line=>{let m;try{m=JSON.parse(line);}catch{return;}const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}});
const request=(method,params)=>new Promise((resolve,reject)=>{const current=++id;const timer=setTimeout(()=>reject(new Error('Toolkit timeout: '+method+' '+stderr)),45000);pending.set(current,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:current,method,params})+'\n');});
try{
 await request('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'quady3d-toolkit-fixture',version:'1'}});child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
 const result=await request('tools/list',{});const tools=result.tools.filter(t=>t.name.includes('quady3d_'));assert.equal(tools.length,8);
 const quote=tools.find(t=>t.name.endsWith('quady3d_quote'));assert.equal(quote.inputSchema.oneOf.length,2);
 console.log(JSON.stringify({status:'passed',toolkit:'v0.44.3',quady3d_tool_count:tools.length,quote_input_variants:quote.inputSchema.oneOf.length,tools:tools.map(t=>t.name),paid_generation_calls:0,production_api_calls:0,website:'https://quady3d.com/integrations/mcp'}));
}finally{
 child.stdin.end();await new Promise(resolve=>{const t=setTimeout(()=>{child.kill('SIGTERM');resolve();},1500);child.once('exit',()=>{clearTimeout(t);resolve();});});
 for(const p of pending.values())clearTimeout(p.timer);
}
