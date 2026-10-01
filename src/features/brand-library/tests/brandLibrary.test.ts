import { describe, expect, it } from 'vitest'
import { LocalBrandLibraryRepository } from '../repositories/brandLibraryRepository'
import type { StorageService } from '../../brand-mirror/services/storageService'
import { LEGACY_STORAGE_KEY, LIBRARY_STORAGE_KEY } from '../../brand-mirror/services/storageService'
import type { BrandDocument, BrandTokens } from '../../brand-mirror/models/brandMirrorModels'
import { INITIAL_TOKENS } from '../../brand-mirror/models/brandMirrorModels'
import type { BrandLibraryDocument } from '../models/brandLibraryModels'
import {
  createBrand,
  duplicateBrand,
  emptyLibrary,
  findActiveRecord,
  fromBrandDocument,
  migrateLegacyDocument,
  purgeBrand,
  restoreBrand,
  softDeleteBrand,
  switchActiveBrand,
  uniqueName,
  updateBrandDocument,
  validateBrandName,
} from '../domain/brandLibraryRules'

const FIXED_NOW = new Date('2026-01-02T03:04:05.000Z')

function document(overrides: Partial<BrandTokens> = {}, versions: BrandDocument['versions'] = []): BrandDocument {
  return { version: 1, theme: 'studio', tokens: { ...INITIAL_TOKENS, ...overrides }, versions }
}

class MemoryStorage implements StorageService {
  values = new Map<string, string>()
  shouldFail = false
  read(key: string): string | null { return this.values.get(key) ?? null }
  write(key: string, value: string): void {
    if (this.shouldFail) throw new Error('offline')
    this.values.set(key, value)
  }
}

function seed(storage: MemoryStorage, library: BrandLibraryDocument): void {
  storage.write(LIBRARY_STORAGE_KEY, JSON.stringify(library))
}

// domain rules ----------------------------------------------------------------

describe('brandLibraryRules', () => {
  it('deduplicates names and appends numbered 副本 suffixes', () => {
    expect(uniqueName('Acme', ['Acme'])).toBe('Acme 副本')
    expect(uniqueName('Acme', ['Acme', 'Acme 副本'])).toBe('Acme 副本 3')
  })

  it('validates brand names', () => {
    expect(validateBrandName('   ')).toContain('不能为空')
    expect(validateBrandName('a'.repeat(31))).toContain('30')
    expect(validateBrandName('Acme')).toBeNull()
  })

  it('migrates a legacy document untouched as the active brand', () => {
    const legacy = document({ primary: '#123456' }, [{ id: 'version-1', label: 'Version A', tokens: { ...INITIAL_TOKENS, primary: '#123456' }, createdAt: '2025-12-01T00:00:00.000Z' }])
    const { library } = migrateLegacyDocument(legacy, FIXED_NOW)
    expect(library.brands).toHaveLength(1)
    expect(library.activeBrandId).toBe(library.brands[0].id)
    expect(library.brands[0].name).toBe('我的品牌')
    expect(library.brands[0].tokens.primary).toBe('#123456')
    expect(library.brands[0].versions).toHaveLength(1)
  })

  it('duplicates a brand with independent copies of tokens and versions', () => {
    let library = emptyLibrary()
    const created = createBrand(library, INITIAL_TOKENS, FIXED_NOW)
    library = created.library
    const duplicated = duplicateBrand(library, created.brandId, new Date('2026-02-02T00:00:00.000Z'))
    if (duplicated === null) throw new Error('duplicate must be created')
    library = duplicated.library
    expect(library.brands).toHaveLength(2)
    expect(library.brands[1].name).toContain('副本')
    library.brands[0].tokens.primary = '#000000'
    expect(library.brands[1].tokens.primary).toBe(INITIAL_TOKENS.primary)
  })

  it('soft deletes to trash, restores, and can permanently purge without touching other brands', () => {
    let library = emptyLibrary()
    library = createBrand(library, INITIAL_TOKENS, FIXED_NOW).library
    const second = createBrand(library, INITIAL_TOKENS, new Date('2026-03-03T00:00:00.000Z'))
    library = second.library
    library = switchActiveBrand(library, second.brandId)
    library = softDeleteBrand(library, second.brandId, new Date('2026-04-04T00:00:00.000Z'))
    expect(library.brands).toHaveLength(1)
    expect(library.trash).toHaveLength(1)
    expect(library.activeBrandId).toBe(library.brands[0].id)
    library = restoreBrand(library, second.brandId)
    expect(library.brands).toHaveLength(2)
    expect(library.trash).toHaveLength(0)
    library = softDeleteBrand(library, second.brandId, new Date('2026-05-05T00:00:00.000Z'))
    library = purgeBrand(library, second.brandId)
    expect(library.trash).toHaveLength(0)
    expect(library.brands).toHaveLength(1)
  })

  it('updates only the targeted brand document', () => {
    let library = emptyLibrary()
    const first = createBrand(library, INITIAL_TOKENS, FIXED_NOW)
    library = first.library
    const second = createBrand(library, INITIAL_TOKENS, new Date('2026-06-06T00:00:00.000Z'))
    library = second.library
    const changed: BrandDocument = { version: 1, theme: 'night', tokens: { ...INITIAL_TOKENS, primary: '#ABCDEF' }, versions: [] }
    library = updateBrandDocument(library, second.brandId, changed, new Date('2026-07-07T00:00:00.000Z'))
    library = switchActiveBrand(library, first.brandId)
    expect(findActiveRecord(library)?.tokens.primary).toBe(INITIAL_TOKENS.primary)
    expect(library.brands.find((brand) => brand.id === second.brandId)?.tokens.primary).toBe('#ABCDEF')
  })

  it('round-trips records through brand documents without shared references', () => {
    const record = fromBrandDocument(document(), 'brand-x', FIXED_NOW, 'X')
    record.tokens.primary = '#000000'
    expect(INITIAL_TOKENS.primary).toBe('#F15A47')
    expect(record.name).toBe('X')
  })
})

// repository migration & isolation -------------------------------------------

describe('LocalBrandLibraryRepository', () => {
  it('returns an empty library on first run', () => {
    const storage = new MemoryStorage()
    const loaded = new LocalBrandLibraryRepository(storage).load()
    expect(loaded.migrated).toBe(false)
    expect(loaded.library.brands).toHaveLength(0)
  })

  it('migrates legacy single-brand data once and never writes the legacy key', () => {
    const storage = new MemoryStorage()
    const legacy = JSON.stringify(document({ primary: '#654321' }))
    storage.values.set(LEGACY_STORAGE_KEY, legacy)
    const repository = new LocalBrandLibraryRepository(storage)
    const first = repository.load()
    expect(first.migrated).toBe(true)
    expect(first.library.brands).toHaveLength(1)
    expect(first.library.brands[0].tokens.primary).toBe('#654321')
    expect(first.library.activeBrandId).toBe(first.library.brands[0].id)
    // 旧键原封不动
    expect(storage.values.get(LEGACY_STORAGE_KEY)).toBe(legacy)
    expect(storage.values.has(LIBRARY_STORAGE_KEY)).toBe(true)
    // 第二次加载不再重复迁移
    expect(repository.load().migrated).toBe(false)
  })

  it('falls back to an empty library when v2 data is corrupted', () => {
    const storage = new MemoryStorage()
    storage.values.set(LIBRARY_STORAGE_KEY, '{not-json')
    const loaded = new LocalBrandLibraryRepository(storage).load()
    expect(loaded.library.brands).toHaveLength(0)
  })

  it('repairs a dangling active brand id', () => {
    const storage = new MemoryStorage()
    let library = emptyLibrary()
    library = createBrand(library, INITIAL_TOKENS, FIXED_NOW).library
    seed(storage, { ...library, activeBrandId: 'missing-id' })
    const loaded = new LocalBrandLibraryRepository(storage).load()
    expect(loaded.library.activeBrandId).toBe(loaded.library.brands[0].id)
  })

  it('keeps brand data isolated in storage: deleting one brand leaves the other intact', () => {
    const storage = new MemoryStorage()
    const repository = new LocalBrandLibraryRepository(storage)
    let { library } = repository.load()
    const a = createBrand(library, { ...INITIAL_TOKENS, primary: '#111111' }, FIXED_NOW)
    library = a.library
    const b = createBrand(library, { ...INITIAL_TOKENS, primary: '#222222' }, new Date('2026-08-08T00:00:00.000Z'))
    library = { ...b.library, activeBrandId: a.brandId }
    repository.save(library)
    repository.save(softDeleteBrand(library, a.brandId, new Date('2026-09-09T00:00:00.000Z')))
    const reloaded = repository.load().library
    expect(reloaded.brands).toHaveLength(1)
    expect(reloaded.brands[0].tokens.primary).toBe('#222222')
    expect(reloaded.trash[0].tokens.primary).toBe('#111111')
  })
})
