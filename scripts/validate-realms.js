const { realms, items } = require("../data/mock-data");

const expectedCodes = [
  "LUYEN_THE", "KHI_DONG", "LY_HOP", "CHAN_NGUYEN", "THAN_DU", "SIEU_PHAM",
  "NHAP_THANH", "THANH_VUONG", "DONG_HU", "HU_VUONG", "DAO_NGUYEN", "DE_TON", "DAI_DE",
];
const errors = [];

if (realms.length !== expectedCodes.length) errors.push(`expected 13 realms, got ${realms.length}`);
if (realms.reduce((sum, realm) => sum + Number(realm.soTang || 0), 0) !== 109) errors.push("realm chain must contain 109 stages");

for (let index = 0; index < expectedCodes.length; index += 1) {
  const realm = realms[index];
  if (!realm) continue;
  if (realm.code !== expectedCodes[index]) errors.push(`realm ${index + 1} must be ${expectedCodes[index]}`);
  if (Number(realm.stt) !== index + 1) errors.push(`${realm.code} has invalid order`);
  if (!Array.isArray(realm.tangTuVi) || realm.tangTuVi.length !== Number(realm.soTang)) errors.push(`${realm.code} stage catalog mismatch`);

  for (let stageIndex = 1; stageIndex < realm.tangTuVi.length; stageIndex += 1) {
    if (!(realm.tangTuVi[stageIndex].tuViCan > realm.tangTuVi[stageIndex - 1].tuViCan)) errors.push(`${realm.code} cultivation thresholds must increase`);
  }

  const finalStage = realm.tangTuVi.at(-1);
  const next = realms[index + 1];
  if (next) {
    if (!realm.danPhaCanh) errors.push(`${realm.code} missing breakthrough pill`);
    const pill = items.find((item) => item.id === realm.danPhaCanh);
    if (!pill || pill.type !== "BREAKTHROUGH_PILL" || pill.realmCode !== next.code) errors.push(`${realm.code} breakthrough pill does not target ${next.code}`);
    if (!(next.tuViTienCap > finalStage.nguongDotPha)) errors.push(`${next.code} stage 1 must exceed ${realm.code} breakthrough threshold`);
    if (!finalStage.daiCanhGioi || finalStage.toiCao) errors.push(`${realm.code} final stage metadata invalid`);
  } else if (realm.code !== "DAI_DE" || realm.soTang !== 1 || realm.danPhaCanh !== null || !finalStage.toiCao || finalStage.nguongDotPha !== null) {
    errors.push("DAI_DE must be the terminal one-stage realm");
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`Realm progression valid: ${realms.length} realms, ${realms.reduce((sum, realm) => sum + realm.soTang, 0)} stages, 12 major breakthroughs.`);
