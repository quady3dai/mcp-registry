// Quady3D AI. Fixture-only acceptance; no external account or generation service.
// Product setup: https://quady3d.com/integrations/mcp
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
const project=process.env.FIXTURE_PROJECT??'/project';
const state=process.env.FIXTURE_STATE??'/home/node/.local/state/quady3d';
const phase=process.argv[2];assert(['create','recover'].includes(phase));
const quoteId='quo_'+'b'.repeat(32),jobId='int_'+'c'.repeat(64),assetId='fixture_asset';
const counterPath=path.join(state,'fixture-counter.json');
let counter={creates:0};try{counter=JSON.parse(await fs.readFile(counterPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const json=Buffer.from(JSON.stringify({asset:{version:'2.0'},scenes:[{nodes:[]}],scene:0}));
const padding=Buffer.alloc((4-json.length%4)%4,0x20);const payload=Buffer.concat([json,padding]);
const glb=Buffer.alloc(20+payload.length);glb.write('glTF');glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8);glb.writeUInt32LE(payload.length,12);glb.writeUInt32LE(0x4e4f534a,16);payload.copy(glb,20);
const snapshot=()=>({id:jobId,operation:'text-to-3d',model:'fixture-text',status:'succeeded',credits:{reserved:0,charged:0,refunded:0},assets:[{id:assetId,format:'glb',role:'model',content_type:'model/gltf-binary',byte_size:glb.length,download_path:'/api/v1/assets/'+assetId}],created_at:Math.floor(Date.now()/1000),request_id:'fixture_job'});
const api=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');let body='';for await(const part of req)body+=part;
  let result;
  if(req.method==='GET'&&url.pathname==='/api/v1/account')result={account_id:'acc_'+'a'.repeat(64),balance_credits:100,plan:'fixture',download_access:true,key_limits:{max_job_credits:1,daily_credits:10},request_id:'fixture_account'};
  else if(req.method==='POST'&&url.pathname==='/api/v1/quotes'){const input=JSON.parse(body);assert.equal(input.operation,'text-to-3d');result={id:quoteId,operation:input.operation,model:input.model,credits:1,price_version:'fixture',expires_at:Math.floor(Date.now()/1000)+300,download_access:true,request_id:'fixture_quote'};}
  else if(req.method==='POST'&&url.pathname==='/api/v1/jobs'){assert.equal(req.headers['idempotency-key'],'docker-fixture-asset');counter.creates++;await fs.writeFile(counterPath,JSON.stringify(counter));result=snapshot();}
  else if(req.method==='GET'&&url.pathname==='/api/v1/jobs/'+jobId)result=snapshot();
  else if(req.method==='GET'&&url.pathname==='/api/v1/assets/'+assetId){res.writeHead(200,{'Content-Type':'model/gltf-binary','Content-Length':glb.length});res.end(glb);return;}
  else{res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:'fixture_path_rejected',message:'Only the loopback fixture API is available.'}}));return;}
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));
 }catch(e){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:'fixture_assertion',message:e.message}}));}
});
await new Promise((resolve,reject)=>{api.once('error',reject);api.listen(31879,'127.0.0.1',resolve);});
const command=process.env.MCP_COMMAND_JSON?JSON.parse(process.env.MCP_COMMAND_JSON):['quady3d-mcp'];
const child=spawn(command[0],[...command.slice(1),'--root',project],{stdio:['pipe','pipe','pipe'],env:{...process.env,QUADY3D_API_KEY:'fixture-placeholder-not-a-real-key',QUADY3D_API_KEY_FILE:'',QUADY3D_API_URL:'http://127.0.0.1:31879/api/v1',QUADY3D_ALLOWED_ROOTS:'[]',QUADY3D_STATE_DIR:state}});
let stderr='';child.stderr.on('data',b=>{stderr=(stderr+b.toString()).slice(-3000);});
let id=0;const pending=new Map();
createInterface({input:child.stdout}).on('line',line=>{let msg;try{msg=JSON.parse(line);}catch{return;}const entry=pending.get(msg.id);if(entry){pending.delete(msg.id);clearTimeout(entry.timer);msg.error?entry.reject(new Error(JSON.stringify(msg.error))):entry.resolve(msg.result);}});
const request=(method,params)=>new Promise((resolve,reject)=>{const current=++id;const timer=setTimeout(()=>{pending.delete(current);reject(new Error('RPC timed out: '+method+' '+stderr));},20000);pending.set(current,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:current,method,params})+'\n');});
const call=async(name,args)=>{const r=await request('tools/call',{name,arguments:args});return {raw:r,value:r.structuredContent??JSON.parse(r.content.find(c=>c.type==='text').text)};};
try{
 await request('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'quady3d-container-fixture',version:'1'}});child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
 const tools=await request('tools/list',{});assert.equal(tools.tools.length,8);
 const account=await call('quady3d_get_account',{});assert.equal(account.value.local_workspace.ready_for_new_generation,true);
 if(phase==='create'){const quote=await call('quady3d_quote',{operation:'text-to-3d',model:'fixture-text',inputs:{prompt:'Synthetic fixture only, no paid generation.'}});assert.equal(quote.value.id,quoteId);}
 const job=await call('quady3d_create_job',{quote_id:quoteId,max_credits:1,client_action_id:'docker-fixture-asset'});assert.equal(job.value.id,jobId);assert.equal(counter.creates,1);
 if(phase==='recover'){
  assert.equal(job.value.recovered,true);
  const target=path.join(project,'fixture.glb');const download=await call('quady3d_download_asset',{asset_id:assetId,target_path:target});assert.equal(download.value.byte_size,glb.length);const saved=await fs.readFile(target);assert.deepEqual(saved,glb);assert.equal(download.value.sha256,createHash('sha256').update(saved).digest('hex'));
  const duplicate=await call('quady3d_download_asset',{asset_id:assetId,target_path:target});assert.equal(duplicate.value.error.code,'file_exists');
  const outside=await call('quady3d_download_asset',{asset_id:assetId,target_path:'/tmp/fixture-outside.glb'});assert.equal(outside.value.error.code,'path_not_allowed');
 }
 console.log(JSON.stringify({phase,status:'passed',tool_count:8,mock_create_requests:counter.creates,recovered:phase==='recover',fixture_delivery_verified:phase==='recover',paid_model_calls:0,production_api_calls:0,website:'https://quady3d.com/integrations/mcp'}));
}finally{
 child.stdin.end();await new Promise(resolve=>{const t=setTimeout(()=>{child.kill('SIGTERM');resolve();},1500);child.once('exit',()=>{clearTimeout(t);resolve();});});await new Promise(resolve=>api.close(resolve));
}
