const fs = require('node:fs/promises');
const path = require('node:path');

const emptyState = () => ({
  users: [], players: [], inventory: [], wallets: [], ledger: [], idempotency: [],
});

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function createStore(file) {
  let state = emptyState();
  let writeChain = Promise.resolve();

  async function init() {
    try {
      state = { ...emptyState(), ...JSON.parse(await fs.readFile(file, 'utf8')) };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await fs.mkdir(path.dirname(file), { recursive: true });
      await persist();
    }
  }

  function persist() {
    const payload = JSON.stringify(state, null, 2);
    writeChain = writeChain.then(async () => {
      const tmp = `${file}.tmp`;
      await fs.writeFile(tmp, payload, 'utf8');
      await fs.rename(tmp, file);
    });
    return writeChain;
  }

  return {
    init,
    read: () => clone(state),
    async update(mutator) {
      const result = await mutator(state);
      await persist();
      return clone(result);
    },
  };
}

module.exports = { createStore };
