import type { BrandDocument } from '../models/brandMirrorModels'
import { clampTokenValues, validateTokens } from '../domain/brandRules'
import { LEGACY_STORAGE_KEY, LIBRARY_STORAGE_KEY, type StorageService } from '../services/storageService'
import type { BrandLibraryDocument } from '../../brand-library/models/brandLibraryModels'
import { findActiveRecord, toBrandDocument, updateBrandDocument } from '../../brand-library/domain/brandLibraryRules'

export interface BrandRepository {
  load(): BrandDocument | null
  save(document: BrandDocument): void
}

export function isBrandDocument(value: unknown): value is BrandDocument {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<BrandDocument>
  return candidate.version === 1 && !!candidate.tokens && Array.isArray(candidate.versions) && typeof candidate.theme === 'string'
}

/** 解析升级前的单品牌文档；非法或缺失时返回 null */
export function parseLegacyDocument(raw: string | null): BrandDocument | null {
  if (!raw) return null
  try {
    const candidate: unknown = JSON.parse(raw)
    if (!isBrandDocument(candidate)) return null
    return { ...candidate, tokens: clampTokenValues(candidate.tokens) }
  } catch {
    return null
  }
}

/** 仅用于迁移：读取旧版单品牌数据，不再写回旧键 */
export class LocalBrandRepository {
  constructor(private readonly storage: StorageService) {}

  load(): BrandDocument | null {
    return parseLegacyDocument(this.storage.read(LEGACY_STORAGE_KEY))
  }
}

function isLibrary(value: unknown): value is BrandLibraryDocument {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<BrandLibraryDocument>
  return candidate.version === 2 && Array.isArray(candidate.brands) && Array.isArray(candidate.trash)
}

/** 活动品牌的读写网关：编辑器只操作当前品牌，其它品牌的数据不会被触及 */
export class ActiveBrandRepository implements BrandRepository {
  constructor(private readonly storage: StorageService) {}

  private readLibrary(): BrandLibraryDocument | null {
    const raw = this.storage.read(LIBRARY_STORAGE_KEY)
    if (!raw) return null
    try {
      const candidate: unknown = JSON.parse(raw)
      return isLibrary(candidate) ? candidate : null
    } catch {
      return null
    }
  }

  load(): BrandDocument | null {
    const library = this.readLibrary()
    if (!library) return null
    const active = findActiveRecord(library)
    return active ? toBrandDocument(active) : null
  }

  save(document: BrandDocument): void {
    const library = this.readLibrary()
    if (!library || !library.activeBrandId) return
    const validationError = validateTokens(document.tokens)
    if (validationError) throw new Error(validationError)
    const next = updateBrandDocument(library, library.activeBrandId, document, new Date())
    this.storage.write(LIBRARY_STORAGE_KEY, JSON.stringify(next))
  }
}
