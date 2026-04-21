# ⚡ SYSTEM — Kỹ Năng (Skills)

---

## Phân Loại Kỹ Năng

| Loại | Mã | Mô tả |
|------|----|-------|
| Thường | `NORMAL` | Kỹ năng cơ bản, tất cả linh căn đều có thể học |
| Linh Căn | `<LINH_CAN>` | Kỹ năng đặc thù theo linh căn (KIM, MOC, THUY...) |

### Gán Kỹ Năng Khi Tạo Nhân Vật
- **2 kỹ năng cơ bản** (`type = NORMAL`): Random từ pool thường
- **2 kỹ năng thuộc tính** (`type = <linhCan>`): Random từ pool linh căn tương ứng

---

## Ngũ Hành Tương Sinh Tương Khắc

### Tương Sinh (Buff nhau)
```
Kim → Thủy → Mộc → Hỏa → Thổ → Kim
Quang → Lôi → Phong → Quang (vòng phụ)
Ám (độc lập, tự tương sinh)
```

### Tương Khắc (Giảm damage nhau)
```
Kim khắc Mộc
Mộc khắc Thổ
Thổ khắc Thủy
Thủy khắc Hỏa
Hỏa khắc Kim
Lôi khắc Ám
Quang khắc Ám
Ám khắc Quang
Phong khắc Thổ
```

### Hệ số tương sinh/khắc
- Tương sinh: Kỹ năng gây thêm **+15% damage** khi dùng trên target bị debuff bởi hành mình sinh ra
- Tương khắc offense: **+20% damage** khi dùng hành khắc kẻ địch
- Tương khắc defense: **-25% damage nhận** khi bị đánh bởi hành mình khắc được

---

## Chi Tiết Từng Linh Căn

### 🔱 KIM (Metal)
**Đặc trưng**: Cứng rắn, sắc bén, phòng thủ cao - đánh đau nhưng chậm

| Kỹ năng | Tier | Hiệu ứng | MP | CD |
|---------|------|-----------|----|----|
| Kim Thể | 1 | +15% pAtk, +8% pDef (10s) | 20 | 15s |
| Hộ Kim Thuẫn | 1 | Giảm 20% damage nhận (8s) | 25 | 20s |
| Kim Lưỡi Đao | 2 | Slash AoE, 180% pAtk dmg | 40 | 12s |
| Thiết Giáp Thuật | 2 | +30% pDef, phản 10% dmg nhận (12s) | 50 | 25s |
| Vạn Kim Chấn | 3 | AoE lớn, 250% pAtk, gây Stun 2s | 80 | 30s |

**Passive**: Mỗi hit có 8% chance "Kim Phá" — xuyên giáp 30%

---

### 🌿 MỘC (Wood)
**Đặc trưng**: Hồi phục, kiểm soát, bền bỉ

| Kỹ năng | Tier | Hiệu ứng | MP | CD |
|---------|------|-----------|----|----|
| Căn Trói | 1 | Trói chân mục tiêu 3s (root) | 20 | 12s |
| Linh Mộc Phục Hồi | 1 | Hồi 15% maxHP trong 5s | 30 | 20s |
| Thụ Tinh Liên Hoàn | 2 | Bắn 3 rễ cây trói 3 mục tiêu 2s | 45 | 18s |
| Đại Hồi Xuân | 2 | HoT 20% HP/5s + HoT 5% MP | 60 | 30s |
| Mộc Linh Bùng Nổ | 3 | AoE xung quanh 200% mAtk, trói 2s | 90 | 35s |

**Passive**: Tự hồi 0.5% maxHP/3s khi HP < 50%

---

### 💧 THỦY (Water)
**Đặc trưng**: Làm chậm, tăng pháp lực, hỗ trợ

| Kỹ năng | Tier | Hiệu ứng | MP | CD |
|---------|------|-----------|----|----|
| Băng Giá Thuẫn | 1 | Làm chậm 30% tốc độ mục tiêu 4s | 20 | 10s |
| Linh Hải Triều | 1 | +20% mAtk, +25% maxMP (12s) | 25 | 22s |
| Hàn Băng Kích | 2 | Projectile đơn 160% mAtk + Chill 3s | 40 | 10s |
| Thủy Long Cuốn | 2 | AoE Slow 50% + 140% mAtk damage | 55 | 20s |
| Băng Ngục | 3 | Đóng băng 1 mục tiêu 4s, 300% mAtk | 100 | 40s |

**Passive**: +15% MP regen rate

---

### 🔥 HỎA (Fire)
**Đặc trưng**: Damage cao, chí mạng, DoT burn

| Kỹ năng | Tier | Hiệu ứng | MP | CD |
|---------|------|-----------|----|----|
| Liệt Hỏa | 1 | +18% mAtk, +10% crit rate (10s) | 22 | 15s |
| Hỏa Cầu | 1 | Projectile 140% mAtk + Burn 3s (20%/s) | 30 | 8s |
| Bùng Cháy | 2 | AoE xung quanh 180% mAtk, Burn 5s | 50 | 18s |
| Hỏa Thần Giáng Lâm | 2 | +30% crit, +25% mAtk (15s) | 60 | 28s |
| Thiên Hỏa Kiếm | 3 | Laser AoE dài 350% mAtk, Burn 8s | 110 | 45s |

**Passive**: Crit strike gây Burn 2s tự động

---

### 🪨 THỔ (Earth)
**Đặc trưng**: Phòng thủ cao nhất, tăng máu, taunt

| Kỹ năng | Tier | Hiệu ứng | MP | CD |
|---------|------|-----------|----|----|
| Thổ Giáp | 1 | +25% pDef, +10% maxHP (12s) | 25 | 20s |
| Địa Rung | 1 | AoE gần 120% pAtk, Slow 2s | 30 | 12s |
| Thạch Thuẫn | 2 | Hấp thu tối đa 30% maxHP damage (6s) | 45 | 25s |
| Đại Địa Bảo Hộ | 2 | +40% pDef, Area shield cho đồng đội | 70 | 35s |
| Sơn Hà Vạn Lý | 3 | Triệu hồi cột đá gây AoE 200% pAtk + Stun 3s | 100 | 40s |

**Passive**: +20% maxHP bonus tĩnh

---

### ✨ QUANG (Light)
**Đặc trưng**: Tốc độ cao, cơ động, damage nhẹ

| Kỹ năng | Tier | Hiệu ứng | MP | CD |
|---------|------|-----------|----|----|
| Quang Tốc | 1 | +40% move speed, +15% attack speed (8s) | 20 | 15s |
| Tia Quang | 1 | Projectile nhanh 120% mAtk | 20 | 6s |
| Quang Ảnh Phân Thân | 2 | Tạo 1 phân thân tự công 80% damage 6s | 50 | 25s |
| Thánh Quang Bộc Phát | 2 | +35% tốc độ + 20% allAtk (10s) | 60 | 28s |
| Quang Hào Thiên Địa | 3 | Tia sáng AoE lớn 280% mAtk | 100 | 38s |

**Passive**: +10% dodge rate

---

### 🌑 ÁM (Dark)
**Đặc trưng**: Damage burst, làm chậm, debuff

| Kỹ năng | Tier | Hiệu ứng | MP | CD |
|---------|------|-----------|----|----|
| Ám Sát | 1 | Teleport + 150% pAtk backstab | 30 | 15s |
| Hắc Vụ | 1 | Khu vực tối, Slow 40% mục tiêu trong vùng 5s | 35 | 18s |
| Ám Hồn Trảm | 2 | 200% mAtk, ignore 20% pDef | 50 | 14s |
| Huyền Ám Liên Hoàn | 2 | 3 nhát liên tiếp 80%×3 mAtk + Slow 3s | 55 | 20s |
| Tử Thần Giáng | 3 | Burst 400% mAtk, gây Silence 3s | 120 | 50s |

**Passive**: +12% damage với mục tiêu đang bị Slow/Freeze/Root

---

### ⚡ LÔI (Thunder)
**Đặc trưng**: AoE chain lightning, stun, burst damage

| Kỹ năng | Tier | Hiệu ứng | MP | CD |
|---------|------|-----------|----|----|
| Lôi Tích | 1 | Tích điện — đòn tiếp theo +50% damage | 20 | 12s |
| Điện Xẹt | 1 | Chain lightning 3 mục tiêu 120% mAtk | 35 | 10s |
| Lôi Vực | 2 | AoE vùng điện 4s, 60%/s mAtk damage | 55 | 22s |
| Thiên Lôi Kiếm | 2 | Single target 250% mAtk + Stun 2s | 65 | 20s |
| Vạn Lôi Giáng | 3 | Sét đánh AoE lớn 5 lần 100%/hit | 110 | 45s |

**Passive**: 10% chance "Tê Liệt" (Stun 1s) khi đánh thường

---

### 💨 PHONG (Wind)
**Đặc trưng**: Cơ động, knockback, combo

| Kỹ năng | Tier | Hiệu ứng | MP | CD |
|---------|------|-----------|----|----|
| Phong Trảm | 1 | Slash 130% pAtk + Knockback 1 tile | 20 | 8s |
| Tốc Phong | 1 | Dash 3 tile nhanh, né tránh 1s | 25 | 12s |
| Lốc Xoáy | 2 | AoE quanh người 160% pAtk, hút vào | 45 | 18s |
| Phong Bộ | 2 | +50% move speed, miễn chậm 8s | 50 | 25s |
| Thần Phong Thiên Ảnh | 3 | Dash xuyên kẻ địch 3 lần 120%×3 | 90 | 35s |

**Passive**: +15% move speed tĩnh

---

## Kỹ Năng Thường (NORMAL)

| Kỹ năng | Hiệu ứng | MP | CD |
|---------|-----------|----|----|
| Tiên Nhân Chỉ | Projectile đơn 110% pAtk | 15 | 6s |
| Hộ Thể Khí | Shield hút 15% maxHP damage (5s) | 25 | 20s |
| Phi Vân Bộ | Dash + invul 0.3s | 20 | 10s |
| Hồi Linh Thuật | Hồi 10% maxMP ngay lập tức | 0 | 30s |

---

## Backend Data Structure

```json
// GET /api/skills
[
  {
    "id": 1,
    "code": "KIM_THE",
    "name": "Kim Thể",
    "icon": "⚙",
    "linhCan": "KIM",
    "tier": 1,
    "mpTieuHao": 20,
    "hoiChieu": 15,
    "range": 1,
    "aoe": false,
    "aoeR": 0,
    "type": "buff",
    "effect": "pAtk_up",
    "effectVal": 15,
    "thoiGianBuff": 10,
    "satThuong": 0,
    "moTa": "+15% pAtk, +8% pDef trong 10 giây"
  }
]
```

---

## Cooldown & Mana Scaling

- Mana cost scale theo: `mpCost × (1 + realm_stt × 0.05)` — nhân vật cảnh giới cao tốn MP nhiều hơn nhưng có maxMP cao hơn
- Cooldown giảm theo AGI: `cd_actual = cd_base × max(0.5, 1 - agi × 0.002)`
- Crit rate base + bonus từ kỹ năng: cap **60%**
