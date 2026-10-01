import { INITIAL_TOKENS } from '../../brand-mirror/models/brandMirrorModels'
import {
  createBrand,
  duplicateBrand,
  emptyLibrary,
  purgeBrand,
  renameBrand,
  restoreBrand,
  softDeleteBrand,
  switchActiveBrand,
  validateBrandName,
} from '../domain/brandLibraryRules'
import type { BrandLibraryDocument } from '../models/brandLibraryModels'
import type { BrandLibraryRepository } from '../repositories/brandLibraryRepository'

type Listener = () => void

export interface BrandSummary {
  id: string
  name: string
  primary: string
  secondary: string
  versionCount: number
  createdAt: string
  updatedAt: string
}

export interface TrashedBrandSummary extends BrandSummary {
  trashedAt: string
}

export type LibraryTab = 'brands' | 'trash'

export type ConfirmRequest =
  | { type: 'switch'; brandId: string; name: string }
  | { type: 'delete'; brandId: string; name: string; active: boolean }
  | { type: 'purge'; brandId: string; name: string }

export interface BrandLibrarySnapshot {
  status: 'ready' | 'error'
  brands: BrandSummary[]
  activeBrandId: string | null
  trash: TrashedBrandSummary[]
  panelOpen: boolean
  tab: LibraryTab
  request: ConfirmRequest | null
  message: string
}

/** 活动品牌发生实质变化（新建/复制/切换/删除/恢复）时通知页面重新载入编辑器 */
export type ActiveBrandChangedCallback = (message: string) => void

function summarize(library: BrandLibraryDocument): Pick<BrandLibrarySnapshot, 'brands' | 'activeBrandId' | 'trash'> {
  return {
    brands: library.brands.map((brand) => ({
      id: brand.id,
      name: brand.name,
      primary: brand.tokens.primary,
      secondary: brand.tokens.secondary,
      versionCount: brand.versions.length,
      createdAt: brand.createdAt,
      updatedAt: brand.updatedAt,
    })),
    activeBrandId: library.activeBrandId,
    trash: library.trash.map((brand) => ({
      id: brand.id,
      name: brand.name,
      primary: brand.tokens.primary,
      secondary: brand.tokens.secondary,
      versionCount: brand.versions.length,
      createdAt: brand.createdAt,
      updatedAt: brand.updatedAt,
      trashedAt: brand.trashedAt,
    })),
  }
}

export class BrandLibraryViewModel {
  private library: BrandLibraryDocument = emptyLibrary()
  private snapshot: BrandLibrarySnapshot = {
    status: 'ready',
    brands: [],
    activeBrandId: null,
    trash: [],
    panelOpen: false,
    tab: 'brands',
    request: null,
    message: '',
  }
  private readonly listeners = new Set<Listener>()

  constructor(
    private readonly repository: BrandLibraryRepository,
    private readonly onActiveBrandChanged?: ActiveBrandChangedCallback,
  ) {}

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot(): BrandLibrarySnapshot {
    return this.snapshot
  }

  initialize(): void {
    const loaded = this.repository.load()
    this.library = loaded.library
    this.snapshot = {
      ...this.snapshot,
      ...summarize(this.library),
      message: loaded.migrated ? '已将升级前的工作区自动归入品牌「我的品牌」，原有令牌与版本历史保持不变' : '',
    }
    this.emit()
  }

  /** 每次打开面板都重新读取，确保编辑期间产生的令牌与版本改动是最新的 */
  openPanel(): void {
    const loaded = this.repository.load()
    this.library = loaded.library
    this.snapshot = { ...this.snapshot, ...summarize(this.library), panelOpen: true, tab: 'brands', request: null }
    this.emit()
  }

  closePanel(): void {
    this.snapshot = { ...this.snapshot, panelOpen: false, request: null }
    this.emit()
  }

  setTab(tab: LibraryTab): void {
    this.snapshot = { ...this.snapshot, tab, request: null }
    this.emit()
  }

  cancelRequest(): void {
    this.snapshot = { ...this.snapshot, request: null }
    this.emit()
  }

  dismissMessage(): void {
    this.snapshot = { ...this.snapshot, message: '' }
    this.emit()
  }

  createBrand(): void {
    const result = createBrand(this.library, INITIAL_TOKENS, new Date())
    this.library = { ...result.library, activeBrandId: result.brandId }
    if (!this.commit('已创建新品牌，已自动切换')) return
    this.snapshot = { ...this.snapshot, ...summarize(this.library), panelOpen: false }
    this.emit()
    this.onActiveBrandChanged?.('已切换到新品牌，从默认令牌开始创作')
  }

  duplicateBrand(brandId: string): void {
    const result = duplicateBrand(this.library, brandId, new Date())
    if (!result) return
    this.library = { ...result.library, activeBrandId: result.brandId }
    const name = this.library.brands.find((brand) => brand.id === result.brandId)?.name ?? ''
    if (!this.commit(`品牌已复制，已切换到「${name}」`)) return
    this.snapshot = { ...this.snapshot, ...summarize(this.library), panelOpen: false }
    this.emit()
    this.onActiveBrandChanged?.(`已切换到复制出的品牌「${name}」`)
  }

  requestSwitch(brandId: string): void {
    const brand = this.library.brands.find((item) => item.id === brandId)
    if (!brand || brandId === this.library.activeBrandId) return
    this.snapshot = { ...this.snapshot, request: { type: 'switch', brandId, name: brand.name } }
    this.emit()
  }

  requestDelete(brandId: string): void {
    const brand = this.library.brands.find((item) => item.id === brandId)
    if (!brand) return
    this.snapshot = { ...this.snapshot, request: { type: 'delete', brandId, name: brand.name, active: brandId === this.library.activeBrandId } }
    this.emit()
  }

  requestPurge(brandId: string): void {
    const brand = this.library.trash.find((item) => item.id === brandId)
    if (!brand) return
    this.snapshot = { ...this.snapshot, request: { type: 'purge', brandId, name: brand.name } }
    this.emit()
  }

  confirmRequest(): void {
    const request = this.snapshot.request
    if (!request) return
    if (request.type === 'switch') this.applySwitch(request.brandId)
    if (request.type === 'delete') this.applyDelete(request.brandId)
    if (request.type === 'purge') this.applyPurge(request.brandId)
  }

  restoreBrand(brandId: string): void {
    const willBecomeActive = this.library.activeBrandId === null
    this.library = restoreBrand(this.library, brandId)
    const name = this.library.brands.find((brand) => brand.id === brandId)?.name ?? ''
    if (!this.commit(willBecomeActive ? `已恢复并切换到品牌「${name}」` : `已恢复品牌「${name}」`)) return
    this.snapshot = { ...this.snapshot, ...summarize(this.library), request: null }
    this.emit()
    if (willBecomeActive) this.onActiveBrandChanged?.(`已切换到恢复的品牌「${name}」`)
  }

  renameBrand(brandId: string, name: string): void {
    const error = validateBrandName(name)
    if (error) {
      this.snapshot = { ...this.snapshot, status: 'error', message: error }
      this.emit()
      return
    }
    this.library = renameBrand(this.library, brandId, name.trim())
    this.commit('品牌已重命名')
  }

  private applySwitch(brandId: string): void {
    const name = this.library.brands.find((brand) => brand.id === brandId)?.name ?? ''
    this.library = switchActiveBrand(this.library, brandId)
    if (!this.commit(`已切换到品牌「${name}」`)) return
    this.snapshot = { ...this.snapshot, ...summarize(this.library), panelOpen: false, request: null }
    this.emit()
    this.onActiveBrandChanged?.(`已切换到品牌「${name}」`)
  }

  private applyDelete(brandId: string): void {
    const previousActive = this.library.activeBrandId
    const name = this.library.brands.find((brand) => brand.id === brandId)?.name ?? ''
    this.library = softDeleteBrand(this.library, brandId, new Date())
    const nextActive = this.library.activeBrandId
    const nextName = this.library.brands.find((brand) => brand.id === nextActive)?.name ?? ''
    const message =
      previousActive === brandId
        ? nextName
          ? `「${name}」已移入回收站，已自动切换到「${nextName}」`
          : `「${name}」已移入回收站，回收站中可随时恢复`
        : `「${name}」已移入回收站，可在回收站中恢复`
    if (!this.commit(message)) return
    this.snapshot = { ...this.snapshot, ...summarize(this.library), request: null }
    this.emit()
    if (previousActive === brandId) this.onActiveBrandChanged?.(nextName ? `已切换到品牌「${nextName}」` : `品牌「${name}」已删除`)
  }

  private applyPurge(brandId: string): void {
    const name = this.library.trash.find((brand) => brand.id === brandId)?.name ?? ''
    this.library = purgeBrand(this.library, brandId)
    this.commit(`品牌「${name}」已彻底删除，仅影响回收站中的该品牌`)
  }

  /** 写库并刷新摘要；失败时保留内存状态并给出错误反馈 */
  private commit(message: string): boolean {
    try {
      this.repository.save(this.library)
      this.snapshot = { ...this.snapshot, ...summarize(this.library), status: 'ready', message, request: null }
    } catch {
      this.snapshot = { ...this.snapshot, ...summarize(this.library), status: 'error', message: '品牌库保存失败，请稍后重试' }
    }
    this.emit()
    return this.snapshot.status === 'ready'
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener())
  }
}
