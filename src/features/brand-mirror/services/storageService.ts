export const LIBRARY_STORAGE_KEY = 'brandmirror.library.v2'
/** 升级前单品牌文档的存储键，迁移时只读，不再写回 */
export const LEGACY_STORAGE_KEY = 'brandmirror.document.v1'

export interface StorageService {
  read(key: string): string | null
  write(key: string, value: string): void
}

export class LocalStorageService implements StorageService {
  read(key: string): string | null {
    return window.localStorage.getItem(key)
  }

  write(key: string, value: string): void {
    window.localStorage.setItem(key, value)
  }
}
