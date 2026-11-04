"use strict";

function checkEquipmentRealm(item, currentRealmStt) {
  const requirement = item?.requiredRealmStt;
  const requiredRealmStt = requirement === undefined ? 1 : Number(requirement);
  const current = Number(currentRealmStt ?? 1);
  const valid = Number.isInteger(requiredRealmStt) && requiredRealmStt >= 1
    && Number.isInteger(current) && current >= 1;
  return {
    valid,
    eligible: valid && current >= requiredRealmStt,
    requiredRealmStt,
    currentRealmStt: current,
  };
}

module.exports = { checkEquipmentRealm };
