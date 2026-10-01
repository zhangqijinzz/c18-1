import type { BrandTheme, BrandTokens, SavedVersion } from '../../brand-mirror/models/brandMirrorModels'

export interface BrandRecord {
  id: string
  name: string
  tokens: BrandTokens
  theme: BrandTheme
  versions: SavedVersion[]
  createdAt: string
  updatedAt: string
}

export interface TrashedBrand extends BrandRecord {
  trashedAt: string
}

export interface BrandLibraryDocument {
  version: 2
  brands: BrandRecord[]
  activeBrandId: string | null
  trash: TrashedBrand[]
}

export interface LoadedLibrary {
  library: BrandLibraryDocument
  /** 本次加载是否由旧版单品牌数据自动迁移而来 */
  migrated: boolean
}

export const LEGACY_BRAND_NAME = '我的品牌'
export const DEFAULT_BRAND_NAME = '未命名品牌'
export const BRAND_NAME_LIMIT = 30
