const tiers = new Set(['read', 'write', 'sensitive'])
export function createRegistry() {
  const entries = new Map()
  return {
    register(tool) {
      if (!tiers.has(tool.tier) || !tool.name || !tool.schema || typeof tool.run !== 'function') throw new Error('Invalid assistant tool')
      if (entries.has(tool.name)) throw new Error('Duplicate assistant tool')
      entries.set(tool.name, tool)
    },
    list: () => [...entries.values()],
  }
}
