import { cloneTokens } from '../../brand-mirror/domain/brandRules'
import type { BrandDocument, BrandTokens } from '../../brand-mirror/models/brandMirrorModels'
import type { BrandLibraryDocument, BrandRecord, TrashedBrand } from '../models/brandLibraryModels'
import { BRAND_NAME_LIMIT, DEFAULT_BRAND_NAME, LEGACY_BRAND_NAME } from '../models/brandLibraryModels'

export function createId(prefix: string, now: Date): string {
  return `${prefix}-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** 生成在现有品牌中不冲突的名称，重名时追加“副本”“副本 2”…… */
export function uniqueName(base: string, existingNames: string[]): string {
  const used = new Set(existingNames)
  if (!used.has(base)) return base
  for (let counter = 2; ; counter += 1) {
    const candidate = `${base} 副本${counter === 2 ? '' : ` ${counter}`}`
    if (!used.has(candidate)) return candidate
  }
}

export function validateBrandName(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return '品牌名称不能为空'
  if (trimmed.length > BRAND_NAME_LIMIT) return `品牌名称不能超过 ${BRAND_NAME_LIMIT} 个字符`
  return null
}

export function toBrandDocument(record: BrandRecord): BrandDocument {
  return { version: 1, tokens: cloneTokens(record.tokens), theme: record.theme, versions: record.versions.map((version) => ({ ...version, tokens: cloneTokens(version.tokens) })) }
}

export function fromBrandDocument(document: BrandDocument, id: string, now: Date, name = DEFAULT_BRAND_NAME): BrandRecord {
  const timestamp = now.toISOString()
  return {
    id,
    name,
    tokens: cloneTokens(document.tokens),
    theme: document.theme,
    versions: document.versions.map((version) => ({ ...version, tokens: cloneTokens(version.tokens) })),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function emptyLibrary(): BrandLibraryDocument {
  return { version: 2, brands: [], activeBrandId: null, trash: [] }
}

/** 旧版单品牌文档整体迁入一个新品牌，令牌与版本历史原样保留 */
export function migrateLegacyDocument(document: BrandDocument, now: Date): { library: BrandLibraryDocument; brandId: string } {
  const brandId = createId('brand', now)
  return {
    library: { ...emptyLibrary(), brands: [fromBrandDocument(document, brandId, now, LEGACY_BRAND_NAME)], activeBrandId: brandId },
    brandId,
  }
}

export function createBrand(library: BrandLibraryDocument, tokens: BrandTokens, now: Date): { library: BrandLibraryDocument; brandId: string } {
  const id = createId('brand', now)
  const record: BrandRecord = {
    id,
    name: uniqueName(DEFAULT_BRAND_NAME, library.brands.map((brand) => brand.name)),
    tokens: cloneTokens(tokens),
    theme: 'studio',
    versions: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }
  return { library: { ...library, brands: [...library.brands, record] }, brandId: id }
}

export function duplicateBrand(library: BrandLibraryDocument, brandId: string, now: Date): { library: BrandLibraryDocument; brandId: string } | null {
  const source = library.brands.find((brand) => brand.id === brandId)
  if (!source) return null
  const id = createId('brand', now)
  const timestamp = now.toISOString()
  const copy: BrandRecord = {
    ...source,
    id,
    name: uniqueName(`${source.name} 副本`, library.brands.map((brand) => brand.name)),
    tokens: cloneTokens(source.tokens),
    versions: source.versions.map((version) => ({ ...version, tokens: cloneTokens(version.tokens) })),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const index = library.brands.findIndex((brand) => brand.id === brandId)
  const brands = [...library.brands.slice(0, index + 1), copy, ...library.brands.slice(index + 1)]
  return { library: { ...library, brands }, brandId: id }
}

export function softDeleteBrand(library: BrandLibraryDocument, brandId: string, now: Date): BrandLibraryDocument {
  const target = library.brands.find((brand) => brand.id === brandId)
  if (!target) return library
  const trashed: TrashedBrand = { ...target, trashedAt: now.toISOString() }
  const brands = library.brands.filter((brand) => brand.id !== brandId)
  const activeBrandId = library.activeBrandId === brandId ? (brands[0]?.id ?? null) : library.activeBrandId
  return { ...library, brands, activeBrandId, trash: [trashed, ...library.trash] }
}

export function restoreBrand(library: BrandLibraryDocument, brandId: string): BrandLibraryDocument {
  const target = library.trash.find((brand) => brand.id === brandId)
  if (!target) return library
  const record: BrandRecord = {
    id: target.id,
    name: target.name,
    tokens: cloneTokens(target.tokens),
    theme: target.theme,
    versions: target.versions.map((version) => ({ ...version, tokens: cloneTokens(version.tokens) })),
    createdAt: target.createdAt,
    updatedAt: target.updatedAt,
  }
  return { ...library, brands: [...library.brands, record], trash: library.trash.filter((brand) => brand.id !== brandId), activeBrandId: library.activeBrandId ?? record.id }
}

export function purgeBrand(library: BrandLibraryDocument, brandId: string): BrandLibraryDocument {
  return { ...library, trash: library.trash.filter((brand) => brand.id !== brandId) }
}

export function switchActiveBrand(library: BrandLibraryDocument, brandId: string): BrandLibraryDocument {
  if (!library.brands.some((brand) => brand.id === brandId)) return library
  return { ...library, activeBrandId: brandId }
}

export function renameBrand(library: BrandLibraryDocument, brandId: string, name: string): BrandLibraryDocument {
  return { ...library, brands: library.brands.map((brand) => (brand.id === brandId ? { ...brand, name, updatedAt: brand.updatedAt } : brand)) }
}

export function updateBrandDocument(library: BrandLibraryDocument, brandId: string, document: BrandDocument, now: Date): BrandLibraryDocument {
  return {
    ...library,
    brands: library.brands.map((brand) =>
      brand.id === brandId
        ? { ...brand, tokens: cloneTokens(document.tokens), theme: document.theme, versions: document.versions.map((version) => ({ ...version, tokens: cloneTokens(version.tokens) })), updatedAt: now.toISOString() }
        : brand,
    ),
  }
}

export function findActiveRecord(library: BrandLibraryDocument): BrandRecord | null {
  return library.brands.find((brand) => brand.id === library.activeBrandId) ?? null
}
