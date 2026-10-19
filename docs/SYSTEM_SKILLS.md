# SYSTEM SKILLS - code-aligned MVP

Nguon chuan: `data/mock-data.js`, `data/balance.js`, `socket/game.js`.
Tai lieu nay mo ta phan da co trong code; noi dung mo rong duoc danh dau **future**.

## Catalog hien tai

- 9 linh can: KIM, MOC, THUY, HOA, THO, QUANG, AM, LOI, PHONG.
- 66 skill trong catalog: 6 active cho moi linh can, bo skill chung va passive.
- Active phai hoc va gan vao loadout, toi da 4 o; chi skill trong loadout moi duoc kich hoat.
- Passive khong chiem o va khong bam dung. Khi da hoc, server cong tat ca `passiveModifiers` vao stat/combat.
- Skill chua hoc khong duoc render thanh skill co the dung; client chi hien thi du lieu server tra ve.

## Hop dong du lieu skill

Skill co cac truong chinh: `id`, `code`, `name`, `icon`, `linhCan`, `type`, `tier`, `mpTieuHao`, `hoiChieu`, `range`, `aoe`, `aoeR`, `satThuong`, `effect`, `effectVal`, `moTa`, `passiveModifiers`.

`type` phan biet active/passive; `effect` mo ta nhom tac dung nhu damage, buff attack/defense, heal, speed, cooldown, control. Hieu ung hien tai can duoc xem la combat data server-authoritative, khong phai animation client.

## Can bang linh can

Quan he ngu hanh la loi the mem, khong ap che cung:

- Server tinh quan he khac/sinh theo `affinityMultiplier` va chenh lech `linhCanStrength`.
- He bi khac co damage giam; he chiem uu the co damage va mot bonus crit nho.
- Ket qua bi gioi han trong bien an toan; build, canh gioi, stat, trang bi va skill van la nguon suc manh chinh.

Moi linh can co skill gay damage de train quai. Vai tro khac nhau: cong kich, phong thu, hoi phuc, toc do, khong che hoac burst; khong he nao duoc dong thoi vuot troi o moi mat.

## Luong su dung

`learn skill -> server cap nhat learnedSkills -> equip active vao 4 slot -> client gui skill_request -> server kiem tra muc tieu/range/MP/cooldown -> server tinh damage/effect -> socket tra ket qua -> client render floating text, flash va animation.`

## Chua co trong MVP

Skill tree, nang cap tier theo cap do, combo, animation rieng cho tung effect, PvP day du, party buff va he thong sach/ngoc hoc skill chi la huong mo rong; khong duoc xem la tinh nang da hoan tat.
