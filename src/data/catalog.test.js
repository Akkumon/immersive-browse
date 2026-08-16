import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { allShows } from './catalog'

describe('catalog artwork parity', () => {
  it('provides a valid local PNG thumbnail for every modal', () => {
    expect(allShows).toHaveLength(48)
    for (const show of allShows) {
      const asset = resolve(process.cwd(), 'public', show.image.replace(/^\//, ''))
      expect(existsSync(asset), `${show.title} is missing ${show.image}`).toBe(true)
      expect([...readFileSync(asset).subarray(0, 8)], `${show.title} artwork is not a PNG`).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    }
  })
})
