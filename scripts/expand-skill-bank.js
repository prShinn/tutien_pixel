"use strict";
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const backend = path.resolve(process.env.GAME_BACKEND_DIR || path.join(root, '../tutien_pixel_be'));
if (typeof process.loadEnvFile !== 'function') throw new Error('Use Node.js 24, matching BE.');
if (fs.existsSync(path.join(backend, '.env'))) process.loadEnvFile(path.join(backend, '.env'));
const beRequire = createRequire(path.join(backend, 'package.json'));
const mysql = beRequire('mysql2/promise');
const { db } = beRequire('./src/config');
const seed = beRequire('./src/data/mock-data');
const output = path.join(root, 'data/skill-bank-v1.json');
const designs = {
  KIM: [['KIM_TIEN_LIEN_XA','Kim Tiễn Liên Xạ','slash'],['BACH_KIEM_TRAN','Bách Kiếm Trận','blade-rain'],['KIM_CUONG_CHIEN_Y','Kim Cương Chiến Ý','shield'],['THIEN_NHAN_PHA_KHONG','Thiên Nhận Phá Không','crescent']],
  MOC: [['THANH_DANG_THICH','Thanh Đằng Thích','branch'],['BACH_HOA_LAO','Bách Hoa Lao','forest'],['CAM_LO_HOI_SINH','Cam Lộ Hồi Sinh','heal'],['CO_MOC_LONG_NHA','Cổ Mộc Long Nha','wood-spirit']],
  THUY: [['HAN_TINH_THICH','Hàn Tinh Thích','ice-arrow'],['BANG_LIEN_TRAN','Băng Liên Trận','snowfall'],['HUYEN_THUY_HO_MACH','Huyền Thủy Hộ Mạch','water-shield'],['BAC_HAI_TRIEU_SINH','Bắc Hải Triều Sinh','tide']],
  HOA: [['XICH_DIEM_CHI','Xích Diệm Chỉ','fireball'],['HOA_VU_LUU_TINH','Hỏa Vũ Lưu Tinh','flame-field'],['CHAN_HOA_CHIEN_TAM','Chân Hỏa Chiến Tâm','solar-mark'],['CUU_DIEM_PHAN_KHONG','Cửu Diệm Phần Không','volcanic-lotus']],
  THO: [['NHAM_THACH_QUYEN','Nham Thạch Quyền','stone-strike'],['DIA_CHAN_LIEN_HOAN','Địa Chấn Liên Hoàn','quake'],['HUYEN_NHAM_HO_THE','Huyền Nham Hộ Thể','stone-armor'],['THIEN_SON_TRAN_NGUC','Thiên Sơn Trấn Ngục','mountain-slam']],
  QUANG: [['TINH_QUANG_THICH','Tinh Quang Thích','light-blade'],['THANH_QUANG_TRAN','Thánh Quang Trận','sun-column'],['NHAT_QUANG_HOI_MENH','Nhật Quang Hồi Mệnh','star-heal'],['THIEN_TINH_GIANG_THE','Thiên Tinh Giáng Thế','starburst']],
  AM: [['DA_ANH_TRAM','Dạ Ảnh Trảm','shadow-needles'],['U_HON_KET_GIOI','U Hồn Kết Giới','void-field'],['HUYEN_AM_NGUNG_THAN','Huyền Âm Ngưng Thần','dark-eye'],['VAN_HON_PHE_TAM','Vạn Hồn Phệ Tâm','soul-drain']],
  PHONG: [['PHONG_LIET_TRAM','Phong Liệt Trảm','wind-blade'],['THIEN_PHONG_TRUYEN','Thiên Phong Triền','nine-gales'],['LUU_VAN_KHINH_BO','Lưu Vân Khinh Bộ','leaf-speed'],['BAO_PHONG_TUYET_VUC','Bạo Phong Tuyệt Vực','cyclone-cage']],
  LOI: [['TU_DIEN_XUYEN_TAM','Tử Điện Xuyên Tâm','thunder-strike'],['LOI_DINH_KET_TRAN','Lôi Đình Kết Trận','storm-field'],['THIEN_LOI_KIM_GIAP','Thiên Lôi Kim Giáp','thunder-shield'],['CUU_TIEU_LOI_KIEP','Cửu Tiêu Lôi Kiếp','lightning-rain']],
};
const support = { KIM:['buff_atk',20], MOC:['heal',48], THUY:['buff_vitals',22], HOA:['buff_crit',18], THO:['buff_def',24], QUANG:['heal',45], AM:['buff_cast',18], PHONG:['buff_spd',22], LOI:['shield',24] };
const debuff = { KIM:['armor_break',12], MOC:['root',0.8], THUY:['slow',20], HOA:['burn',18], THO:['stun',0.5], QUANG:['',0], AM:['curse',15], PHONG:['slow',15], LOI:['stun',0.5] };
const additions = Object.entries(designs).flatMap(([linhCan, entries], rootIndex) => entries.map(([code,name,vfxForm], index) => {
  const isSupport = index === 2;
  const [effect,effectVal] = isSupport ? support[linhCan] : debuff[linhCan];
  const physical = ['KIM','THO','PHONG','LOI'].includes(linhCan);
  return { id:9000+rootIndex*10+index, code,name,linhCan,category:'ACTIVE',tier:[1,2,2,3][index],type:physical?'PHYS':'MAGIC',targetType:isSupport?'SELF':'ENEMY',scalingStat:physical?'str':'ene',satThuong:[1.15,1.25,0,1.85][index],mpTieuHao:[7,16,18,32][index],hoiChieu:[4,10,18,32][index],range:isSupport?0:6,dienRong:index===1?2.2:index===3?3:0,effect,effectVal,thoiGianBuff:isSupport?8:['root','stun'].includes(effect)?effectVal:4,vfxForm,icon:seed.roots.find((r)=>r.id===linhCan)?.emoji||'✦',moTa:`${name}: ${isSupport?'hỗ trợ bản thân':index===1||index===3?'tấn công diện rộng':'tấn công một mục tiêu'} hệ ${linhCan}${effect?`, hiệu ứng ${effect}`:''}.` };
}));

async function main(){
  const connection=await mysql.createConnection({host:db.host,port:db.port,user:db.user,password:db.password,database:db.database});
  try {
    if(process.argv.includes('--prepare')){
      const [rows]=await connection.query("SELECT record_id AS code,document_json AS doc,is_deleted AS deleted FROM admin_content_records WHERE collection_name='skills'");
      const merged=new Map(seed.skills.map((s)=>[s.code,s]));
      for(const row of rows){if(row.deleted)merged.delete(row.code);else merged.set(row.code,typeof row.doc==='string'?JSON.parse(row.doc):row.doc);}
      for(const skill of additions)if(!merged.has(skill.code)&&!rows.some((r)=>r.code===skill.code&&r.deleted))merged.set(skill.code,skill);
      const assets=[...merged.values()].map((skill)=>({...skill,img:`./assets/skills/bank-v1/${skill.code.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}.png`}));
      fs.writeFileSync(output,JSON.stringify({version:1,additions:additions.map((s)=>s.code),skills:assets},null,2)+'\n');
      console.log(JSON.stringify({prepared:assets.length,newSkills:additions.length}));return;
    }
    if(!process.argv.includes('--apply'))throw new Error('Choose --prepare or --apply');
    const plan=JSON.parse(fs.readFileSync(output,'utf8'));
    if(new Set(plan.skills.map((s)=>s.code)).size!==plan.skills.length)throw new Error('Duplicate skill codes');
    if(new Set(plan.skills.map((s)=>s.img)).size!==plan.skills.length)throw new Error('Duplicate skill image paths');
    for(const skill of plan.skills)if(!fs.existsSync(path.join(root,'public',skill.img)))throw new Error(`Missing icon: ${skill.code}`);
    let inserted=0,updated=0;
    await connection.beginTransaction();
    for(const planned of plan.skills){
      const [[prior]]=await connection.execute("SELECT document_json AS doc,is_deleted AS deleted FROM admin_content_records WHERE collection_name='skills' AND record_id=? FOR UPDATE",[planned.code]);
      if(prior?.deleted)throw new Error(`Skill deleted after preparation: ${planned.code}`);
      const before=prior?(typeof prior.doc==='string'?JSON.parse(prior.doc):prior.doc):null;
      const currentDefinition = seed.skills.find((skill) => skill.code === planned.code);
      const after=before?{...before,img:planned.img}:currentDefinition?{...currentDefinition,img:planned.img}:{...planned};
      if(before&&JSON.stringify(before)===JSON.stringify(after))continue;
      if(prior){await connection.execute("UPDATE admin_content_records SET document_json=?,version=version+1,updated_by='skill-bank-v1' WHERE collection_name='skills' AND record_id=?",[JSON.stringify(after),planned.code]);updated++;}
      else {await connection.execute("INSERT INTO admin_content_records(collection_name,record_id,document_json,is_deleted,version,updated_by) VALUES('skills',?,?,0,1,'skill-bank-v1')",[planned.code,JSON.stringify(after)]);inserted++;}
      await connection.execute("INSERT INTO admin_audit_logs(id,actor_id,action,resource,before_json,after_json,request_id) VALUES(?,'skill-bank-v1',?,?,?,?,'skill-bank-v1')",[crypto.randomUUID(),prior?'CONTENT_UPDATE':'CONTENT_CREATE',`content:skills:${planned.code}`,before?JSON.stringify(before):null,JSON.stringify(after)]);
    }
    await connection.commit();
    const [[count]]=await connection.query("SELECT COUNT(*) AS total,COUNT(DISTINCT JSON_UNQUOTE(JSON_EXTRACT(document_json,'$.img'))) AS images FROM admin_content_records WHERE collection_name='skills' AND is_deleted=0");
    console.log(JSON.stringify({persisted:true,inserted,updated,...count}));
  }catch(error){await connection.rollback();throw error;}finally{await connection.end();}
}
main().catch((e)=>{console.error(`Skill bank operation failed: ${e.code||e.message}`);process.exitCode=1;});
