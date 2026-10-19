/**
 * World graph cho dai chau luc.
 * Day la metadata dieu huong, khong thay the terrain runtime cua tung world.
 * ACTIVE = da co terrain/world data; PLANNED = khung quy hoach, chua cho vao game.
 */
const continent = {
  id: "CUU_THAN_DAI_LUC",
  code: "cuu_than_dai_luc",
  name: "Cửu Thiên Đại Lục",
  description: "Một châu lục cổ trang rộng lớn, nối liền bằng quan đạo, sơn đạo và trận pháp không gian.",
  scale: "continent",
  regions: [
    {
      id: "THANH_VAN_PHU",
      name: "Thanh Vân Phủ",
      terrain: "civilized",
      order: 1,
      description: "Vùng dân cư và tu sĩ sơ nhập đạo; thành trì là trung tâm giao thương.",
      maps: [
        { code: "thanh_van_tran", name: "Thanh Vân Trấn", type: "CITY", status: "ACTIVE", tier: 1, level: "1-3", role: "capital", connections: ["dao_hoa_thon", "binh_nguyen"] },
        { code: "dao_hoa_thon", name: "Đào Hoa Thôn", type: "VILLAGE", status: "PLANNED", tier: 1, level: "1-5", role: "village", connections: ["thanh_van_tran", "thanh_van_ngoai_vuc"] },
        { code: "thanh_van_ngoai_vuc", name: "Ngoại Vực Thanh Vân", type: "WILDERNESS_EDGE", status: "PLANNED", tier: 2, level: "3-8", role: "transition", connections: ["dao_hoa_thon", "thanh_van_son_coc"] },
      ],
    },
    {
      id: "HOANG_DA_TRUNG_NGUYEN",
      name: "Trung Nguyên Hoang Dã",
      terrain: "river_plain",
      order: 2,
      description: "Đồng bằng, sông ngòi và quan đạo nối các khu dân cư với vùng tu luyện.",
      maps: [
        { code: "binh_nguyen", name: "Bình Nguyên Hoang Dã", type: "PLAIN", status: "ACTIVE", tier: 2, level: "2-8", role: "farm", connections: ["thanh_van_tran", "thanh_van_son_coc", "man_hoang_bien"] },
        { code: "thanh_van_son_coc", name: "Sơn Cốc Thanh Vân", type: "MOUNTAIN_FOOTHILL", status: "PLANNED", tier: 3, level: "6-15", role: "foothill", connections: ["binh_nguyen", "bach_van_son"] },
        { code: "man_hoang_bien", name: "Biên Hoang", type: "WILDERNESS", status: "PLANNED", tier: 5, level: "18-30", role: "frontier", connections: ["binh_nguyen", "van_yeu_dai_son"] },
      ],
    },
    {
      id: "THIEN_LINH_SON_MACH",
      name: "Thiên Linh Sơn Mạch",
      terrain: "mountain_range",
      order: 3,
      description: "Vùng núi liên hoàn, linh mạch đan xen, độ cao và hiểm địa tăng theo từng lớp.",
      maps: [
        { code: "bach_van_son", name: "Bạch Vân Sơn", type: "MOUNTAIN", status: "PLANNED", tier: 4, level: "12-22", role: "mountain", connections: ["thanh_van_son_coc", "van_yeu_dai_son"] },
        { code: "van_yeu_dai_son", name: "Vạn Yêu Đại Sơn", type: "MOUNTAIN_RANGE", status: "PLANNED", tier: 5, level: "20-35", role: "beast_range", connections: ["bach_van_son", "man_hoang_bien", "thien_mon_quan"] },
        { code: "thien_mon_quan", name: "Thiên Môn Quan", type: "MOUNTAIN_PASS", status: "PLANNED", tier: 6, level: "30-45", role: "gate", connections: ["van_yeu_dai_son", "man_hoang_co_dia"] },
      ],
    },
    {
      id: "MAN_HOANG_CUC_BAC",
      name: "Man Hoang Cực Bắc",
      terrain: "ancient_wilderness",
      order: 4,
      description: "Cổ địa chưa khai phá, yêu thú và di tích cổ chiếm ưu thế; không phải khu vực tân thủ.",
      maps: [
        { code: "man_hoang_co_dia", name: "Man Hoang Cổ Địa", type: "ANCIENT_WILDERNESS", status: "PLANNED", tier: 7, level: "40-60", role: "endgame_frontier", connections: ["thien_mon_quan", "vuc_sau_tang_long"] },
        { code: "vuc_sau_tang_long", name: "Vực Sâu Tàng Long", type: "ABYSS", status: "PLANNED", tier: 8, level: "60+", role: "endgame", connections: ["man_hoang_co_dia"] },
      ],
    },
  ],
};

function getWorldStructure() {
  return JSON.parse(JSON.stringify(continent));
}

module.exports = { continent, getWorldStructure };
