export type BrandTheme = 'studio' | 'editorial' | 'night'
export type MirrorStatus = 'loading' | 'ready' | 'editing' | 'error'

export interface BrandTokens {
  primary: string
  secondary: string
  radiusScale: number[]
  spacingScale: number[]
  typeScale: number[]
}

export interface SavedVersion {
  id: string
  label: string
  tokens: BrandTokens
  createdAt: string
}

export interface BrandDocument {
  version: 1
  tokens: BrandTokens
  theme: BrandTheme
  versions: SavedVersion[]
}

/** 品牌库中的一个品牌：独立保存自己的令牌文档与版本历史 */
export interface BrandRecord {
  id: string
  name: string
  document: BrandDocument
  createdAt: string
  updatedAt: string
}

/** 回收站条目：删除后保留品牌数据，直到用户手动永久删除 */
export interface TrashedBrand {
  record: BrandRecord
  trashedAt: string
}

export type PendingBrandAction =
  | { kind: 'switch'; brandId: string; brandName: string; currentName: string }
  | { kind: 'delete'; brandId: string; brandName: string; versionCount: number }
  | { kind: 'purge'; brandId: string; brandName: string; versionCount: number }

export interface BrandSummary {
  id: string
  name: string
  primary: string
  secondary: string
  versionCount: number
  updatedAt: string
}

export interface BrandLibrarySnapshot {
  brands: BrandSummary[]
  activeBrandId: string | null
  activeBrandName: string | null
  trashedBrands: TrashedBrand[]
  pendingAction: PendingBrandAction | null
  canUndoDelete: boolean
  lastDeletedName: string | null
}

export interface BrandMirrorSnapshot extends BrandLibrarySnapshot {
  status: MirrorStatus
  tokens: BrandTokens
  theme: BrandTheme
  versions: SavedVersion[]
  compareMode: boolean
  activeVersionId: string | null
  contrastRatio: number
  contrastWarning: boolean
  message: string
}

export const INITIAL_TOKENS: BrandTokens = {
  primary: '#F15A47',
  secondary: '#24324A',
  radiusScale: [8, 12, 18, 28],
  spacingScale: [4, 8, 12, 20, 32],
  typeScale: [12, 14, 16, 20, 28, 40],
}

export const THEME_PRESETS: Record<BrandTheme, { label: string; tokens: BrandTokens }> = {
  studio: {
    label: 'Studio warm',
    tokens: INITIAL_TOKENS,
  },
  editorial: {
    label: 'Editorial green',
    tokens: {
      primary: '#238B73', secondary: '#173C35', radiusScale: [4, 8, 12, 18], spacingScale: [4, 8, 16, 24, 40], typeScale: [12, 14, 16, 22, 30, 44],
    },
  },
  night: {
    label: 'Night signal',
    tokens: {
      primary: '#A98BFF', secondary: '#191829', radiusScale: [6, 10, 14, 22], spacingScale: [4, 8, 12, 18, 28], typeScale: [12, 14, 16, 20, 28, 38],
    },
  },
}
