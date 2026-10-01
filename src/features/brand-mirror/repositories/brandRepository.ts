import { validateTokens } from '../domain/brandRules'
import type { BrandDocument, BrandRecord, TrashedBrand } from '../models/brandMirrorModels'
import { BRAND_KEY_PREFIX, LEGACY_DOCUMENT_KEY, LIBRARY_INDEX_KEY, TRASH_INDEX_KEY, brandKey } from '../services/storageService'
import type { StorageService } from '../services/storageService'

export interface BrandLibraryState {
  brands: BrandRecord[]
  activeBrandId: string | null
  trashed: TrashedBrand[]
  /** 本次加载是否把旧版单文档迁移进了品牌库 */
  migrated: boolean
}

interface LibraryIndex {
  version: 2
  activeBrandId: string | null
  brandIds: string[]
}

export interface BrandLibraryRepository {
  load(): BrandLibraryState
  saveBrand(record: BrandRecord): void
  softDeleteBrand(brandId: string): TrashedBrand
  restoreBrand(brandId: string): void
  purgeBrand(brandId: string): void
  setActiveBrand(brandId: string | null): void
}

export class LocalBrandLibraryRepository implements BrandLibraryRepository {
  private index: LibraryIndex = { version: 2, activeBrandId: null, brandIds: [] }
  private loaded = false

  constructor(private readonly storage: StorageService) {}

  load(): BrandLibraryState {
    const migrated = !this.loaded && this.migrateLegacyDocument()
    this.readIndex()
    const brands = this.index.brandIds
      .map((id) => this.readBrand(id))
      .filter((record): record is BrandRecord => record !== null)
    // 索引与实际文档对不上时（如手工清理过存储），以实际文档为准
    if (brands.length !== this.index.brandIds.length) {
      this.index.brandIds = brands.map((brand) => brand.id)
      if (this.index.activeBrandId && !brands.some((brand) => brand.id === this.index.activeBrandId)) {
        this.index.activeBrandId = brands[0]?.id ?? null
      }
      this.writeIndex()
    }
    const trashed = this.readTrash()
    this.loaded = true
    return { brands, activeBrandId: this.index.activeBrandId, trashed, migrated }
  }

  saveBrand(record: BrandRecord): void {
    const validationError = validateTokens(record.document.tokens)
    if (validationError) throw new Error(validationError)
    this.ensureLoaded()
    this.storage.write(brandKey(record.id), JSON.stringify(record))
    if (!this.index.brandIds.includes(record.id)) {
      this.index.brandIds = [...this.index.brandIds, record.id]
    }
    if (!this.index.activeBrandId) this.index.activeBrandId = record.id
    this.writeIndex()
  }

  setActiveBrand(brandId: string | null): void {
    this.ensureLoaded()
    this.index.activeBrandId = brandId
    this.writeIndex()
  }

  /** 软删除：仅移除该品牌自己的 key 与索引项，数据进入回收站，其它品牌不受影响 */
  softDeleteBrand(brandId: string): TrashedBrand {
    this.ensureLoaded()
    const record = this.readBrand(brandId)
    if (!record) throw new Error('品牌不存在或已被删除')
    const entry: TrashedBrand = { record, trashedAt: new Date().toISOString() }
    const trashed = [entry, ...this.readTrash().filter((item) => item.record.id !== brandId)]
    this.storage.write(TRASH_INDEX_KEY, JSON.stringify(trashed))
    this.storage.remove(brandKey(brandId))
    this.index.brandIds = this.index.brandIds.filter((id) => id !== brandId)
    if (this.index.activeBrandId === brandId) {
      this.index.activeBrandId = this.index.brandIds[0] ?? null
    }
    this.writeIndex()
    return entry
  }

  /** 从回收站恢复：写回该品牌自己的 key，不动任何其它品牌 */
  restoreBrand(brandId: string): void {
    this.ensureLoaded()
    const trashed = this.readTrash()
    const entry = trashed.find((item) => item.record.id === brandId)
    if (!entry) return
    const restored: BrandRecord = { ...entry.record, updatedAt: new Date().toISOString() }
    this.storage.write(brandKey(brandId), JSON.stringify(restored))
    this.storage.write(TRASH_INDEX_KEY, JSON.stringify(trashed.filter((item) => item.record.id !== brandId)))
    this.index.brandIds = [...this.index.brandIds, brandId]
    if (!this.index.activeBrandId) this.index.activeBrandId = brandId
    this.writeIndex()
  }

  /** 永久删除：仅作用于回收站中的单个品牌 */
  purgeBrand(brandId: string): void {
    this.ensureLoaded()
    const trashed = this.readTrash()
    const remaining = trashed.filter((item) => item.record.id !== brandId)
    this.storage.write(TRASH_INDEX_KEY, JSON.stringify(remaining))
    this.storage.remove(brandKey(brandId))
  }

  /**
   * 旧版升级迁移：把 v1 单文档原样归入一个新品牌。
   * 令牌、主题、版本历史一律不改动（不做 clamp 等二次加工）。
   */
  private migrateLegacyDocument(): boolean {
    this.readIndex()
    if (this.index.brandIds.length > 0 || this.index.activeBrandId) return false
    const raw = this.storage.read(LEGACY_DOCUMENT_KEY)
    if (!raw) return false
    let document: BrandDocument
    try {
      const candidate: unknown = JSON.parse(raw)
      if (!isDocument(candidate)) return false
      document = candidate
    } catch {
      return false
    }
    const now = new Date().toISOString()
    const id = makeBrandId()
    const record: BrandRecord = { id, name: '我的第一个品牌', document, createdAt: now, updatedAt: now }
    // 先写品牌文档，再写索引，最后移除旧 key，任一步中断都不会丢数据
    this.storage.write(brandKey(id), JSON.stringify(record))
    this.index = { version: 2, activeBrandId: id, brandIds: [id] }
    this.writeIndex()
    this.storage.remove(LEGACY_DOCUMENT_KEY)
    return true
  }

  private ensureLoaded(): void {
    if (!this.loaded) this.load()
  }

  private readIndex(): void {
    const raw = this.storage.read(LIBRARY_INDEX_KEY)
    if (raw) {
      try {
        const candidate: unknown = JSON.parse(raw)
        if (isIndex(candidate)) {
          this.index = { version: 2, activeBrandId: candidate.activeBrandId, brandIds: [...candidate.brandIds] }
          return
        }
      } catch {
        // 索引损坏时回退为空库，由品牌文档与迁移逻辑重建
      }
    }
    this.index = { version: 2, activeBrandId: null, brandIds: [] }
  }

  private writeIndex(): void {
    this.storage.write(LIBRARY_INDEX_KEY, JSON.stringify(this.index))
  }

  private readBrand(brandId: string): BrandRecord | null {
    const raw = this.storage.read(brandKey(brandId))
    if (!raw) return null
    try {
      const candidate: unknown = JSON.parse(raw)
      if (isRecord(candidate)) return candidate
      return null
    } catch {
      return null
    }
  }

  private readTrash(): TrashedBrand[] {
    const raw = this.storage.read(TRASH_INDEX_KEY)
    if (!raw) return []
    try {
      const candidate: unknown = JSON.parse(raw)
      if (!Array.isArray(candidate)) return []
      return candidate.filter(isTrashed)
    } catch {
      return []
    }
  }
}

export function makeBrandId(): string {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10)
  return `brand-${Date.now().toString(36)}-${suffix}`
}

function isDocument(value: unknown): value is BrandDocument {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<BrandDocument>
  return candidate.version === 1 && !!candidate.tokens && Array.isArray(candidate.versions) && typeof candidate.theme === 'string'
}

function isIndex(value: unknown): value is LibraryIndex {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<LibraryIndex>
  return candidate.version === 2 && Array.isArray(candidate.brandIds)
}

function isRecord(value: unknown): value is BrandRecord {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<BrandRecord>
  return typeof candidate.id === 'string' && typeof candidate.name === 'string' && isDocument(candidate.document)
}

function isTrashed(value: unknown): value is TrashedBrand {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<TrashedBrand>
  return typeof candidate.trashedAt === 'string' && isRecord(candidate.record)
}

// BRAND_KEY_PREFIX 供测试与调试时识别品牌 key 命名空间
export { BRAND_KEY_PREFIX }
