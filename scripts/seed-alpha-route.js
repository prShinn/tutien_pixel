"use strict";
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),backend=path.resolve(process.env.GAME_BACKEND_DIR||path.join(root,'../tutien_pixel_be'));
if(typeof process.loadEnvFile!=='function')throw new Error('Use Node 24');
if(fs.existsSync(path.join(backend,'.env')))process.loadEnvFile(path.join(backend,'.env'));
const req=createRequire(path.join(backend,'package.json')),mysql=req('mysql2/promise'),{db}=req('./src/config'),seed=req('./src/data/mock-data');
const {validateWorld}=req('./src/admin/admin-world-service');
const decode=v=>typeof v==='string'?JSON.parse(v):v;
const route=[
 ['alpha_thanh_moc_lam','Thanh Mộc Lâm','FOREST_VALLEY',['THANH_DIEP_YEU','THIET_NHA_LANG','SA_DIA_TRU'],1,4],
 ['alpha_han_thuy_khe','Hàn Thủy Khê','RIVER_VALLEY',['THUY_LINH_THAO','BANG_NHA_LANG','DOC_NHA_LANG'],3,6],
 ['alpha_xich_diem_son','Xích Diệm Sơn','MOUNTAIN_FOOTHILL',['XICH_MAO_TRU','DUNG_NHAM_LANG','HOA_TINH_THAO'],5,9],
 ['alpha_loi_van_coc','Lôi Vân Cốc','MOUNTAIN_FOOTHILL',['DIEN_NHA_LANG','LOI_LINH_THAO','THACH_BI_LANG'],7,11],
];
function makeMap(spec,index,monsters){
 const [code,tenMap,biome,codes,min,max]=spec,w=160,h=120;
 const ground=Array.from({length:h},()=>Array(w).fill(index===2?1:0)),objects=Array.from({length:h},()=>Array(w).fill(-1)),elevation=Array.from({length:h},()=>Array(w).fill(0)),collision=Array.from({length:h},()=>Array(w).fill(0));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const river=83+Math.round(Math.sin(y*.11+index)*5);
  if(Math.abs(x-river)<4){ground[y][x]=2;collision[y][x]=2;}
  if(x<3||y<3||x>w-4||y>h-4){objects[y][x]=6;collision[y][x]=2;}
  else if((x*31+y*17+index*19)%103===0&&Math.abs(x-river)>7){objects[y][x]=index===2?6:5;collision[y][x]=2;}
  if(index>1)elevation[y][x]=Math.floor(y/40);
 }
 function clear(x,y,r=4){for(let yy=y-r;yy<=y+r;yy++)for(let xx=x-r;xx<=x+r;xx++)if(xx>2&&yy>2&&xx<w-3&&yy<h-3){ground[yy][xx]=4;objects[yy][xx]=-1;collision[yy][xx]=0;}}
 for(let x=9;x<151;x++)clear(x,60,4);
 for(const y of [28,90])for(let x=20;x<146;x++)clear(x,y,2);
 for(const x of [30,74,126])for(let y=24;y<96;y++)clear(x,y,2);
 const centers=[[38,28],[74,90],[126,28]];
 const monsterSpawns=codes.map((code,i)=>({packId:`PACK_${spec[0]}_${i}`,templateId:code,centerX:centers[i][0],centerY:centers[i][1],count:3,radius:5,aggroRange:26,leashDistance:36,chaseDurationMs:4500}));
 for(const [x,y]of centers)clear(x,y,10);
 const npcs=[
  {id:`${code}_guide`,name:'Dẫn Lộ Tu Sĩ',x:20,y:52,type:'dialog',img:'./assets/characters/npc-elder-guide-v2.png',dialog:`${tenMap}: yêu thú cấp ${min}–${max}. Giữ lối chính để tránh bãi quái; linh thạch thu được cần hấp thụ trong túi để tăng tu vi.`},
  {id:`${code}_herbalist`,name:'Dược Sư Du Phương',x:24,y:68,type:'shop',dialog:'Có thể mua thuốc và linh thạch. Đan phá cảnh phải giữ trong túi; máy chủ tự tiêu hao một viên khi phá đại cảnh giới.'},
  {id:`${code}_guard`,name:'Hộ Vệ Tiền Trạm',x:138,y:52,type:'dialog',dialog:'Cổng phía đông nối vùng kế tiếp. Chưa đủ thực lực hãy quay lại lối cũ; tu vi dư vẫn được giữ sau đột phá.'},
 ];
 for(const n of npcs)clear(n.x,n.y,3);
 return {id:code,code,tenMap,type:'PLAIN',biome,status:'PUBLISHED',version:1,isDefault:false,regionId:'THANH_VAN_REGION',tier:index+1,recommendedRealmMin:1,recommendedRealmMax:3,recommendedLevelMin:min,recommendedLevelMax:max,w,h,spawnX:14,spawnY:60,jsonMap:collision,layers:{ground,objects,elevation},npcs,monsters:codes.map(c=>{const m=monsters.find(v=>v.code===c);if(!m)throw new Error('Missing catalog monster '+c);return m;}),monsterSpawns,portals:[],tags:['alpha-route','starter'],rules:{pvp:false}};
}
function reachable(map){
 const visited=new Set(),queue=[[map.spawnX,map.spawnY]];let head=0;
 while(head<queue.length){const [x,y]=queue[head++],key=y*map.w+x;if(x<0||y<0||x>=map.w||y>=map.h||visited.has(key)||map.jsonMap[y][x]===2)continue;visited.add(key);queue.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);}
 for(const point of [...map.npcs,...map.portals,...map.monsterSpawns.map(p=>({x:p.centerX,y:p.centerY}))])if(!visited.has(point.y*map.w+point.x))throw new Error('Unreachable point in '+map.code);
}
async function main(){
 const c=await mysql.createConnection({host:db.host,port:db.port,user:db.user,password:db.password,database:db.database});
 try{
  const [records]=await c.query('SELECT collection_name AS collection,record_id AS id,document_json AS doc,is_deleted AS deleted FROM admin_content_records');
  function merged(collection,base){const m=new Map(base.map(v=>[v.code||v.id,v]));for(const r of records.filter(r=>r.collection===collection)){if(r.deleted)m.delete(r.id);else m.set(r.id,decode(r.doc));}return [...m.values()];}
  const monsters=merged('monsters',seed.monsterDefs),skills=merged('skills',seed.skills),items=merged('items',seed.items);
  const [storedWorlds]=await c.query('SELECT code,status,version,document_json AS doc FROM admin_worlds');
  const worldMap=new Map(seed.worlds.map(w=>[w.code,w]));for(const row of storedWorlds){if(row.status==='DELETED')worldMap.delete(row.code);else worldMap.set(row.code,{...decode(row.doc),status:row.status,version:Number(row.version)});}
  const existing=[...worldMap.values()],anchor=existing.find(w=>w.isDefault&&w.status!=='DRAFT')||existing.find(w=>w.code==='thanh_van_tran');
  if(!anchor)throw new Error('No starting map available');
  // Use the existing safe spawn as the return landing; outbound gate is nearby on a walkable tile.
  const ax=Number(anchor.spawnX),ay=Number(anchor.spawnY);let gate;
  for(let r=8;r<=18&&!gate;r++)for(const [dx,dy]of [[r,0],[-r,0],[0,r],[0,-r]]){const x=ax+dx,y=ay+dy;if(x>=0&&y>=0&&x<anchor.w&&y<anchor.h&&anchor.jsonMap?.[y]?.[x]!==2&&!(anchor.portals||[]).some(p=>Math.hypot(p.x-x,p.y-y)<6)){gate={x,y};break;}}
  if(!gate)throw new Error('No safe gate location near starting spawn');
  const maps=route.map((spec,i)=>makeMap(spec,i,monsters));
  const portal=(id,x,y,target,toX,toY)=>({id,x,y,toMap:target.code,denMap:target.code,toX,toY,tenMapDen:target.tenMap});
  for(let i=0;i<maps.length;i++){
   const previous=i?maps[i-1]:anchor;
   maps[i].portals.push(portal(`${maps[i].code}_return`,8,60,previous,i?138:ax,i?60:ay));
   if(i<maps.length-1)maps[i].portals.push(portal(`${maps[i].code}_forward`,150,60,maps[i+1],20,60));
  }
  const linkedAnchor={...anchor,portals:[...(anchor.portals||[]).filter(p=>p.id!=='alpha_route_entry'),portal('alpha_route_entry',gate.x,gate.y,maps[0],20,60)]};
  const all=[...existing.filter(w=>!maps.some(m=>m.code===w.code)&&w.code!==anchor.code),linkedAnchor,...maps];
  for(const map of maps){const v=validateWorld(map,all);if(!v.valid||v.warnings.length)throw new Error(JSON.stringify(v));reachable(map);for(const m of map.monsters)if(!fs.existsSync(path.join(root,'public',m.img)))throw new Error('Missing monster art: '+m.code);}
  const consumables=[
   {...items.find(i=>i.id==='DAN_PHI_THANG'),giaMua:650,giaBan:0},
   {...items.find(i=>i.id==='DAN_KHI_NGUNG'),giaMua:2200,giaBan:0},
   {id:'STONE_LINH_TRUNG',maDo:'STONE_LINH_TRUNG',name:'Linh Thạch Trung',tenDo:'Linh Thạch Trung',type:'STONE',loai:'STONE',giaTriTuVi:600,giaMua:100,giaBan:50,icon:'💎',moTa:'Hấp thụ 600 tu vi. Không tự phá cảnh.'},
   {id:'STONE_LINH_LON',maDo:'STONE_LINH_LON',name:'Linh Thạch Lớn',tenDo:'Linh Thạch Lớn',type:'STONE',loai:'STONE',giaTriTuVi:1800,giaMua:300,giaBan:150,icon:'💎',moTa:'Hấp thụ 1800 tu vi. Phần dư được giữ khi đột phá.'},
  ];
  if(consumables.some(i=>!i.id))throw new Error('Breakthrough pill catalog missing');
  const report={before:{skills:skills.length,nonBossMonsters:monsters.filter(m=>m.type!=='BOSS').length,worlds:existing.length,pills:seed.realms.filter(r=>r.danPhaCanh).map(r=>({realm:r.code,item:r.danPhaCanh,buyPrice:items.find(i=>i.id===r.danPhaCanh)?.giaMua||0}))},route:maps.map(m=>({code:m.code,name:m.tenMap,npcs:m.npcs.length,monsters:m.monsters.map(v=>v.code),packs:m.monsterSpawns.length})),anchor:anchor.code,items:consumables.map(i=>({id:i.id,price:i.giaMua}))};
  report.catalogHealth={
   skillImagesMissing:skills.filter(s=>!s.img||!fs.existsSync(path.join(root,'public',s.img))).map(s=>s.code),
   monsterImagesMissing:monsters.filter(m=>!m.img||!fs.existsSync(path.join(root,'public',m.img))).map(m=>m.code),
   monsterLootMissing:monsters.filter(m=>!seed.lootTables[m.lootTableId]).map(m=>m.code),
   activeSkills:skills.filter(s=>s.category!=='PASSIVE').length,passiveSkills:skills.filter(s=>s.category==='PASSIVE').length,
  };
  const [[packet]]=await c.query('SELECT @@max_allowed_packet AS bytes');
  report.documentBytes={anchor:Buffer.byteLength(JSON.stringify(linkedAnchor)),maps:maps.map(m=>Buffer.byteLength(JSON.stringify(m))),mysqlPacket:Number(packet.bytes)};
  fs.writeFileSync(path.join(root,'data/alpha-content-audit.json'),JSON.stringify(report,null,2)+'\n');
  if(!process.argv.includes('--apply')){console.log(JSON.stringify(report));return;}
  if(report.documentBytes.mysqlPacket<Math.max(report.documentBytes.anchor,...report.documentBytes.maps)*1.2)throw new Error('MySQL max_allowed_packet is too small for existing world + audit; use at least 16 MB and reconnect before applying.');
  await c.beginTransaction();
  const audit=async(action,resource,before,after)=>c.execute('INSERT INTO admin_audit_logs(id,actor_id,action,resource,before_json,after_json,request_id) VALUES(?,?,?,?,?,?,?)',[crypto.randomUUID(),'alpha-route-v1',action,resource,before?JSON.stringify(before):null,JSON.stringify(after),'alpha-route-v1']);
  let created=0,updatedItems=0;
  for(const map of maps){
   const [[old]]=await c.execute('SELECT code,document_json AS doc,version,updated_by AS actor FROM admin_worlds WHERE code=? FOR UPDATE',[map.code]);
   if(old){
    const before=decode(old.doc);
    if(old.actor==='alpha-route-v1'&&Number(old.version)===1&&(before.monsterSpawns||[]).some(p=>p.aggroRange===14)){
     const after={...before,version:2,monsterSpawns:before.monsterSpawns.map(p=>({...p,aggroRange:26,leashDistance:36}))};
     await c.execute("UPDATE admin_worlds SET version=2,document_json=?,updated_by='alpha-route-v1' WHERE code=?",[JSON.stringify(after),map.code]);await audit('WORLD_UPDATE',`world:${map.code}`,before,after);
    }
    continue;
   }
   await c.execute("INSERT INTO admin_worlds(code,status,version,document_json,updated_by) VALUES(?,'PUBLISHED',1,?,'alpha-route-v1')",[map.code,JSON.stringify(map)]);await audit('WORLD_CREATE',`world:${map.code}`,null,map);created++;
  }
  const [[anchorRow]]=await c.execute('SELECT document_json AS doc,version,status FROM admin_worlds WHERE code=? FOR UPDATE',[anchor.code]);
  const current=anchorRow?{...decode(anchorRow.doc),version:Number(anchorRow.version),status:anchorRow.status}:anchor;
  if(!(current.portals||[]).some(p=>p.id==='alpha_route_entry')){
   const next={...current,portals:[...(current.portals||[]),linkedAnchor.portals.find(p=>p.id==='alpha_route_entry')],version:Number(current.version||0)+1};
   await c.execute("INSERT INTO admin_worlds(code,status,version,document_json,updated_by) VALUES(?,?,?,?, 'alpha-route-v1') ON DUPLICATE KEY UPDATE document_json=VALUES(document_json),version=VALUES(version),updated_by=VALUES(updated_by)",[next.code,next.status||'PUBLISHED',next.version,JSON.stringify(next)]);await audit('WORLD_UPDATE',`world:${next.code}`,current,next);
  }
  for(const item of consumables){
   const [[old]]=await c.execute("SELECT document_json AS doc,is_deleted AS deleted FROM admin_content_records WHERE collection_name='items' AND record_id=? FOR UPDATE",[item.id]);
   if(old){
    const before=decode(old.doc);
    if(old.deleted||!['DAN_PHI_THANG','DAN_KHI_NGUNG'].includes(item.id)||Number(before.giaMua)>0)continue;
    const after={...before,giaMua:item.giaMua};
    await c.execute("UPDATE admin_content_records SET document_json=?,version=version+1,updated_by='alpha-route-v1' WHERE collection_name='items' AND record_id=?",[JSON.stringify(after),item.id]);await audit('CONTENT_UPDATE',`content:items:${item.id}`,before,after);updatedItems++;continue;
   }
   await c.execute("INSERT INTO admin_content_records(collection_name,record_id,document_json,is_deleted,version,updated_by) VALUES('items',?,?,0,1,'alpha-route-v1')",[item.id,JSON.stringify(item)]);await audit('CONTENT_CREATE',`content:items:${item.id}`,null,item);updatedItems++;
  }
  await c.commit();
  const [[counts]]=await c.query("SELECT COUNT(*) AS maps FROM admin_worlds WHERE code LIKE 'alpha_%' AND status='PUBLISHED'");
  console.log(JSON.stringify({persisted:true,created,updatedItems,...counts,anchor:anchor.code}));
 }catch(e){await c.rollback();throw e;}finally{await c.end();}
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
