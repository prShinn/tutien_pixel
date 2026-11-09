const QUEST_DEFINITIONS = Object.freeze([
  {
    id: 'first-journey', category: 'main', title: 'Lời dặn của Lão Tu Sĩ', giver: 'Lão Tu Sĩ',
    location: 'Bình Nguyên Hoang Dã', summary: 'Rèn luyện bước đầu để chuẩn bị rời Thanh Vân Trấn.',
    objective: 'Đánh bại yêu thú', target: 3, initialStatus: 'active', initialProgress: 0,
    eventType: 'monster_kill', rewards: [
      { type: 'xu', amount: 50, icon: 'icon-coins', label: '50 Xu' },
      { type: 'tuVi', amount: 120, icon: 'icon-lotus', label: '120 Tu Vi' },
    ],
  },
  {
    id: 'plain-training', category: 'side', title: 'Thử sức ở Bình Nguyên', giver: 'Lão Tu Sĩ',
    location: 'Bình Nguyên Hoang Dã', summary: 'Rèn luyện kỹ năng chiến đấu trước khi tiến sâu vào vùng hoang dã.',
    objective: 'Đánh bại yêu thú', target: 5, initialStatus: 'available', initialProgress: 0,
    eventType: 'monster_kill', rewards: [
      { type: 'xu', amount: 80, icon: 'icon-coins', label: '80 Xu' },
      { type: 'item', itemId: 'STONE_LINH_NHO', amount: 1, icon: 'icon-talisman', label: '1 Linh Thạch Nhỏ' },
    ],
  },
  {
    id: 'spirit-stones', category: 'daily', title: 'Cơ duyên linh thạch', giver: 'Chủ Tiệm',
    location: 'Bình Nguyên Hoang Dã', summary: 'Thu thập chiến lợi phẩm rơi trên đường để đổi lấy tài nguyên tu luyện.',
    objective: 'Nhặt linh thạch nhỏ', target: 3, initialStatus: 'available', initialProgress: 0,
    eventType: 'collect_item', targetItemId: 'STONE_LINH_NHO', rewards: [
      { type: 'xu', amount: 60, icon: 'icon-coins', label: '60 Xu' },
      { type: 'item', itemId: 'HUYET_NGOC_NHO', amount: 2, icon: 'icon-potion-hp', label: '2 Huyết Ngọc Nhỏ' },
    ],
  },
]);

function makeSnapshot(meta, states, definitions = QUEST_DEFINITIONS) {
  return {
    revision: Number(meta?.revision || 0),
    trackedId: meta?.trackedId || null,
    quests: definitions.map((definition) => {
      const state = states.find((entry) => entry.questId === definition.id);
      return {
        id: definition.id,
        category: definition.category,
        title: definition.title,
        giver: definition.giver,
        location: definition.location,
        summary: definition.summary,
        objective: definition.objective,
        progress: Number(state?.progress ?? definition.initialProgress),
        target: definition.target,
        status: state?.status || definition.initialStatus,
        rewards: definition.rewards.map(({ icon, label }) => ({ icon, label })),
      };
    }),
  };
}

module.exports = { QUEST_DEFINITIONS, makeSnapshot };
