"use strict";

const BASE = process.env.DEMO_URL || "http://127.0.0.1:3000";
const ADMIN_KEY = process.env.ADMIN_MAP_KEY || "demo-admin";

function grid(width, height, value) {
  return Array.from({ length: height }, () => Array(width).fill(value));
}

async function adminRequest(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "x-admin-key": ADMIN_KEY,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${data.error || JSON.stringify(data)}`);
  return data;
}

async function main() {
  console.log("=== BẮT ĐẦU DÙNG TÍNH NĂNG HỆ THỐNG / ADMIN API ĐỂ THÊM VẬT PHẨM & MAP ===");

  // 1. THÊM VẬT PHẨM MỚI QUA ADMIN CONTENT API
  const itemPayload = {
    id: "ITEM_HUYET_LONG_DAO",
    maDo: "ITEM_HUYET_LONG_DAO",
    name: "Huyết Long Đao",
    type: "EQUIPMENT",
    slot: "weapon",
    rarity: "rare",
    giaMua: 150,
    giaBan: 50,
    requiredRealmStt: 1,
    img: "./assets/characters/ui-icons.png",
    stats: { atk: 38, critRate: 6 },
    desc: "Đao rèn từ tinh huyết long xà, uy lực kinh nhân.",
  };

  try {
    const itemResult = await adminRequest("/api/admin/content/items", {
      method: "POST",
      body: JSON.stringify(itemPayload),
    });
    console.log("-> [THÀNH CÔNG] Thêm vật phẩm qua API Admin:", itemResult.data.name, "(id:", itemResult.data.id, ")");
  } catch (err) {
    if (err.message.includes("tồn tại")) {
      console.log("-> Vật phẩm đã tồn tại, tiến hành cập nhật qua PUT /api/admin/content/items/:id...");
      const updateResult = await adminRequest(`/api/admin/content/items/${itemPayload.id}`, {
        method: "PUT",
        body: JSON.stringify(itemPayload),
      });
      console.log("-> [THÀNH CÔNG] Cập nhật vật phẩm:", updateResult.data.name);
    } else {
      throw err;
    }
  }

  // 2. THÊM MAP MỚI QUA ADMIN WORLDS API
  const mapCode = "u_minh_coc";
  const width = 320, height = 240;
  const ground = grid(width, height, 0); // 0: cỏ xanh
  const objects = grid(width, height, -1);
  const elevation = grid(width, height, 0);

  // Tạo một con đường đất ở giữa map (loại 4) và một hồ nước nhỏ (loại 2)
  for (let y = 15; y < 40; y++) {
    ground[y][25] = 4;
    ground[y][26] = 4;
  }
  for (let y = 20; y < 28; y++) {
    for (let x = 32; x < 40; x++) {
      ground[y][x] = 2;
    }
  }

  const mapPayload = {
    code: mapCode,
    tenMap: "U Minh Cốc",
    status: "DRAFT",
    regionId: "SON_COC_REGION",
    tier: 2,
    recommendedRealmMin: 2,
    type: "PLAIN",
    biome: "FOREST_VALLEY",
    w: width,
    h: height,
    spawnX: 25,
    spawnY: 25,
    layers: { ground, objects, elevation },
    monsterSpawns: [
      {
        packId: "PACK_DOC_THAO_UMINH",
        templateId: "DOC_THAO",
        centerX: 45,
        centerY: 30,
        count: 4,
        radius: 12,
      },
    ],
    npcs: [
      {
        id: "npc_u_minh_lao_to",
        name: "U Minh Lão Tổ",
        role: "QUEST",
        x: 28,
        y: 25,
        img: "./assets/characters/npc-elder-guide-v2.png",
        dialog: "Nơi đây chướng khí mù mịt, tiểu hữu chớ khinh suất!",
      },
    ],
  };

  try {
    const worldResult = await adminRequest("/api/admin/worlds", {
      method: "POST",
      body: JSON.stringify(mapPayload),
    });
    console.log("-> [THÀNH CÔNG] Tạo map mới qua API Admin:", worldResult.tenMap, "(code:", worldResult.code, ")");
  } catch (err) {
    if (err.message.includes("tồn tại")) {
      console.log("-> Map đã tồn tại, cập nhật qua PUT /api/admin/worlds/:code...");
      const updateWorld = await adminRequest(`/api/admin/worlds/${mapCode}`, {
        method: "PUT",
        body: JSON.stringify(mapPayload),
      });
      console.log("-> [THÀNH CÔNG] Cập nhật map:", updateWorld.tenMap);
    } else {
      throw err;
    }
  }

  // 3. XUẤT BẢN MAP (PUBLISH)
  const publishResult = await adminRequest(`/api/admin/worlds/${mapCode}/publish`, {
    method: "POST",
  });
  console.log("-> [THÀNH CÔNG] Xuất bản map:", publishResult.world.tenMap, "- Trạng thái:", publishResult.world.status);

  // 4. LIÊN KẾT CỔNG DỊCH CHUYỂN 2 CHIỀU GIỮA THANH VÂN SƠN CỐC VÀ U MINH CỐC
  try {
    const linkResult = await adminRequest("/api/admin/portals/link", {
      method: "POST",
      body: JSON.stringify({
        sourceCode: "thanh_van_son_coc",
        targetCode: "u_minh_coc",
        sourceX: 18,
        sourceY: 18,
        targetX: 25,
        targetY: 26,
        label: "Đi tới U Minh Cốc",
      }),
    });
    console.log("-> [THÀNH CÔNG] Liên kết cổng dịch chuyển 2 chiều thành công!");
  } catch (linkErr) {
    console.log("-> Lưu ý liên kết portal:", linkErr.message);
  }

  // 5. KIỂM TRA LẠI DỮ LIỆU PUBLIC TỪ CLIENT VIEW
  const itemsRes = await fetch(`${BASE}/api/items`);
  const allItems = await itemsRes.json();
  const foundItem = allItems.find((i) => i.id === itemPayload.id);

  const worldRes = await fetch(`${BASE}/api/worlds/by-code?code=${mapCode}`);
  const foundWorld = await worldRes.json();

  console.log("\n=== KẾT QUẢ XÁC NHẬN TỪ CLIENT API ===");
  console.log("1. Client nạp thấy vật phẩm mới:", foundItem ? `CÓ (${foundItem.name}, img: ${foundItem.img})` : "CHƯA");
  console.log("2. Client nạp thấy bản đồ mới:", foundWorld && foundWorld.code === mapCode ? `CÓ (${foundWorld.tenMap}, kích thước: ${foundWorld.w}x${foundWorld.h}, NPCs: ${foundWorld.npcs?.length})` : "CHƯA");
  console.log("========================================================================\n");
}

main().catch((err) => {
  console.error("LỖI:", err.message);
  process.exitCode = 1;
});

