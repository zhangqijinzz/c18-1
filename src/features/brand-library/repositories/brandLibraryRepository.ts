import type { BrandLibraryDocument, LoadedLibrary } from '../models/brandLibraryModels'
import { emptyLibrary, migrateLegacyDocument } from '../domain/brandLibraryRules'
import { isBrandDocument, parseLegacyDocument } from '../../brand-mirror/repositories/brandRepository'
import { LEGACY_STORAGE_KEY, LIBRARY_STORAGE_KEY, type StorageService } from '../../brand-mirror/services/storageService'

export interface BrandLibraryRepository {
  /** 读取品牌库；v2 缺失时尝试把旧版单品牌数据整体迁移为一个品牌 */
  load(): LoadedLibrary
  save(library: BrandLibraryDocument): void
}

function isBrandLibrary(value: unknown): value is BrandLibraryDocument {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<BrandLibraryDocument>
  if (candidate.version !== 2 || !Array.isArray(candidate.brands) || !Array.isArray(candidate.trash)) return false
  if (candidate.activeBrandId !== null && typeof candidate.activeBrandId !== 'string') return false
  return candidate.brands.every((brand) => typeof brand.id === 'string' && typeof brand.name === 'string' && isBrandDocument({ version: 1, tokens: brand.tokens, theme: brand.theme, versions: brand.versions }))
}

export class LocalBrandLibraryRepository implements BrandLibraryRepository {
  constructor(private readonly storage: StorageService) {}

  load(): LoadedLibrary {
    const raw = this.storage.read(LIBRARY_STORAGE_KEY)
    if (raw) {
      try {
        const candidate: unknown = JSON.parse(raw)
        if (isBrandLibrary(candidate)) {
          // 活动品牌已不存在时回退到第一个品牌，避免悬空
          const activeBrandId = candidate.brands.some((brand) => brand.id === candidate.activeBrandId) ? candidate.activeBrandId : (candidate.brands[0]?.id ?? null)
          return { library: { ...candidate, activeBrandId }, migrated: false }
        }
      } catch {
        // 损坏的 v2 数据不强行覆盖，落到空库等待用户重建；旧键仍保留不动
      }
      return { library: emptyLibrary(), migrated: false }
    }

    const legacy = parseLegacyDocument(this.storage.read(LEGACY_STORAGE_KEY))
    if (legacy) {
      const { library } = migrateLegacyDocument(legacy, new Date())
      this.storage.write(LIBRARY_STORAGE_KEY, JSON.stringify(library))
      return { library, migrated: true }
    }
    return { library: emptyLibrary(), migrated: false }
  }

  save(library: BrandLibraryDocument): void {
    this.storage.write(LIBRARY_STORAGE_KEY, JSON.stringify(library))
  }
}
