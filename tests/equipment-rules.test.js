"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { checkEquipmentRealm } = require("../game/equipment-rules");

test("equipment realm requirement allows the required realm and higher realms", () => {
  assert.deepEqual(checkEquipmentRealm({ requiredRealmStt: 3 }, 3), {
    valid: true, eligible: true, requiredRealmStt: 3, currentRealmStt: 3,
  });
  assert.equal(checkEquipmentRealm({ requiredRealmStt: 3 }, 8).eligible, true);
  assert.equal(checkEquipmentRealm({ requiredRealmStt: 3 }, 2).eligible, false);
});

test("equipment realm requirement rejects malformed realm values and defaults legacy items to realm one", () => {
  assert.equal(checkEquipmentRealm({}, 1).eligible, true);
  assert.equal(checkEquipmentRealm({ requiredRealmStt: 0 }, 5).valid, false);
  assert.equal(checkEquipmentRealm({ requiredRealmStt: null }, 5).valid, false);
  assert.equal(checkEquipmentRealm({ requiredRealmStt: 2.5 }, 5).valid, false);
  assert.equal(checkEquipmentRealm({ requiredRealmStt: 2 }, "unknown").valid, false);
});
