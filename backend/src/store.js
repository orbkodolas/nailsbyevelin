import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const emptyState = () => ({ bookings: [], reminders: [], payments: [], vouchers: [], blocks: [], openings: [], devices: [], pairings: [] })

export function createStore(filePath) {
  let queue = Promise.resolve()

  async function load() {
    try {
      return { ...emptyState(), ...JSON.parse(await readFile(filePath, 'utf8')) }
    } catch (error) {
      if (error.code === 'ENOENT') return emptyState()
      throw error
    }
  }

  async function save(state) {
    await mkdir(dirname(filePath), { recursive: true })
    const tempPath = `${filePath}.tmp`
    await writeFile(tempPath, JSON.stringify(state, null, 2), 'utf8')
    await rename(tempPath, filePath)
  }

  return {
    async read(reader) {
      const state = await load()
      return reader(state)
    },
    async update(mutator) {
      const operation = queue.then(async () => {
        const state = await load()
        const result = await mutator(state)
        await save(state)
        return result
      })
      queue = operation.catch(() => {})
      return operation
    },
  }
}
