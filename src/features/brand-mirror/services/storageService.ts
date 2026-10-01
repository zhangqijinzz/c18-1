/** 旧版本（v1）唯一文档使用的 key，升级时用于数据迁移 */
export const LEGACY_DOCUMENT_KEY = 'brandmirror.document.v1'
/** 品牌库索引 key */
export const LIBRARY_INDEX_KEY = 'brandmirror.library.v2.index'
/** 回收站 key */
export const TRASH_INDEX_KEY = 'brandmirror.library.v2.trash'
/** 单个品牌文档的 key 前缀，每个品牌独立存储、互不相干 */
export const BRAND_KEY_PREFIX = 'brandmirror.library.v2.brand.'

export function brandKey(brandId: string): string {
  return `${BRAND_KEY_PREFIX}${brandId}`
}

export interface StorageService {
  read(key: string): string | null
  write(key: string, value: string): void
  remove(key: string): void
}

export class LocalStorageService implements StorageService {
  read(key: string): string | null {
    return window.localStorage.getItem(key)
  }

  write(key: string, value: string): void {
    window.localStorage.setItem(key, value)
  }

  remove(key: string): void {
    window.localStorage.removeItem(key)
  }
}
