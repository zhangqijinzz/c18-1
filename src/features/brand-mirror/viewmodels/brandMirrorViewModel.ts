import { clampTokenValues, cloneTokens, contrastRatio, normalizeColor, themeTokens, validateTokens } from '../domain/brandRules'
import type { BrandLibraryRepository } from '../repositories/brandRepository'
import { makeBrandId } from '../repositories/brandRepository'
import type { BrandGuidelinesExporter } from '../services/exportService'
import { INITIAL_TOKENS, type BrandDocument, type BrandLibrarySnapshot, type BrandMirrorSnapshot, type BrandRecord, type BrandSummary, type BrandTheme, type PendingBrandAction, type SavedVersion, type TrashedBrand } from '../models/brandMirrorModels'

type Listener = () => void

interface LastDelete {
  brandId: string
  brandName: string
  wasActive: boolean
}

export class BrandMirrorViewModel {
  private brands: BrandRecord[] = []
  private activeBrandId: string | null = null
  private trashed: TrashedBrand[] = []
  private status: BrandMirrorSnapshot['status'] = 'loading'
  private message = ''
  private compareMode = false
  private pendingAction: PendingBrandAction | null = null
  private lastDelete: LastDelete | null = null

  private readonly listeners = new Set<Listener>()
  private readonly repository: BrandLibraryRepository
  private readonly exporter?: BrandGuidelinesExporter

  constructor(repository: BrandLibraryRepository, exporter?: BrandGuidelinesExporter) {
    this.repository = repository
    this.exporter = exporter
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot(): BrandMirrorSnapshot {
    const active = this.getActiveBrand()
    const document = active?.document
    const tokens = document ? cloneTokens(document.tokens) : cloneTokens(INITIAL_TOKENS)
    const versions = document?.versions ?? []
    const latestVersion = versions[versions.length - 1]
    const ratio = contrastRatio(tokens.primary, tokens.secondary)
    return {
      ...this.librarySnapshot(),
      status: this.status,
      tokens,
      theme: document?.theme ?? 'studio',
      versions,
      compareMode: this.compareMode,
      activeVersionId: latestVersion?.id ?? null,
      contrastRatio: ratio,
      contrastWarning: ratio < 3,
      message: this.message,
    }
  }

  initialize(): void {
    const state = this.repository.load()
    this.brands = state.brands
    this.trashed = state.trashed
    this.activeBrandId = state.activeBrandId
    this.pendingAction = null
    this.compareMode = false
    if (state.migrated) {
      this.message = '已将升级前的工作区自动归入品牌「我的第一个品牌」，令牌与版本历史保持原样'
    } else if (this.activeBrandId) {
      this.message = '已恢复最近一次工作状态'
    } else {
      this.message = '品牌库已就绪，新建一个品牌开始探索'
    }
    this.status = 'ready'
    this.emit()
  }

  // ---------- 品牌库操作 ----------

  /** 新建品牌：从 Studio warm 起点开始，并立即切换过去 */
  createBrand(rawName?: string): void {
    const name = this.normalizeBrandName(rawName) ?? this.uniqueName('新品牌')
    const now = new Date().toISOString()
    const record: BrandRecord = {
      id: makeBrandId(),
      name,
      document: { version: 1, tokens: cloneTokens(INITIAL_TOKENS), theme: 'studio', versions: [] },
      createdAt: now,
      updatedAt: now,
    }
    try {
      this.repository.saveBrand(record)
      this.brands = [...this.brands, record]
      this.switchTo(record.id, `已创建品牌「${name}」并切换`)
    } catch {
      this.fail('品牌创建失败，请稍后重试')
    }
  }

  /** 复制品牌：拷贝令牌与全部版本历史，存为互相独立的新品牌 */
  duplicateBrand(brandId?: string, customName?: string): void {
    const source = this.resolveBrand(brandId)
    if (!source) return
    const now = new Date().toISOString()
    const copy: BrandRecord = {
      id: makeBrandId(),
      name: this.normalizeBrandName(customName) ?? this.duplicateName(source.name),
      document: cloneDocument(source.document),
      createdAt: now,
      updatedAt: now,
    }
    try {
      this.repository.saveBrand(copy)
      this.brands = [...this.brands, copy]
      this.switchTo(copy.id, `已复制为「${copy.name}」，令牌与版本历史独立保存`)
    } catch {
      this.fail('品牌复制失败，请稍后重试')
    }
  }

  /** 请求切换品牌：先经过明确确认（当前更改会自动保存，不丢失） */
  requestSwitchBrand(brandId: string): void {
    if (brandId === this.activeBrandId) return
    const target = this.brands.find((brand) => brand.id === brandId)
    const current = this.getActiveBrand()
    if (!target || !current) return
    this.pendingAction = { kind: 'switch', brandId, brandName: target.name, currentName: current.name }
    this.emit()
  }

  /** 请求删除品牌：必须先确认，删除只进入回收站、可恢复 */
  requestDeleteBrand(brandId: string): void {
    const target = this.brands.find((brand) => brand.id === brandId)
    if (!target) return
    this.pendingAction = { kind: 'delete', brandId, brandName: target.name, versionCount: target.document.versions.length }
    this.emit()
  }

  /** 请求永久删除回收站中的品牌：二次确认，无法恢复 */
  requestPurgeBrand(brandId: string): void {
    const entry = this.trashed.find((item) => item.record.id === brandId)
    if (!entry) return
    this.pendingAction = { kind: 'purge', brandId, brandName: entry.record.name, versionCount: 0 }
    this.emit()
  }

  confirmPendingAction(): void {
    const action = this.pendingAction
    if (!action) return
    this.pendingAction = null
    if (action.kind === 'switch') {
      this.performSwitch(action.brandId, `已切换到品牌「${action.brandName}」，此前的更改已自动保存`)
      return
    }
    if (action.kind === 'delete') {
      const wasActive = action.brandId === this.activeBrandId
      try {
        const entry = this.repository.softDeleteBrand(action.brandId)
        this.trashed = [entry, ...this.trashed.filter((item) => item.record.id !== action.brandId)]
        this.brands = this.brands.filter((brand) => brand.id !== action.brandId)
        if (wasActive) this.activeBrandId = this.brands[0]?.id ?? null
        if (this.activeBrandId) this.repository.setActiveBrand(this.activeBrandId)
        this.lastDelete = { brandId: action.brandId, brandName: action.brandName, wasActive }
        this.compareMode = false
        this.status = 'ready'
        this.message = `已将「${action.brandName}」移入回收站，可在提示条中撤销或稍后从回收站恢复`
      } catch {
        this.fail('品牌删除失败，请稍后重试')
        return
      }
      this.emit()
      return
    }
    // purge
    try {
      this.repository.purgeBrand(action.brandId)
      this.trashed = this.trashed.filter((item) => item.record.id !== action.brandId)
      this.message = `已彻底删除「${action.brandName}」，此操作无法撤销`
    } catch {
      this.fail('操作失败，请稍后重试')
      return
    }
    this.emit()
  }

  cancelPendingAction(): void {
    if (!this.pendingAction) return
    this.pendingAction = null
    this.emit()
  }

  /** 撤销最近一次删除：从回收站取回该品牌，其它品牌不受影响 */
  undoLastDelete(): void {
    const last = this.lastDelete
    if (!last) return
    const entry = this.trashed.find((item) => item.record.id === last.brandId)
    if (!entry) return
    try {
      this.repository.restoreBrand(last.brandId)
      this.trashed = this.trashed.filter((item) => item.record.id !== last.brandId)
      this.brands = [...this.brands, entry.record]
      if (last.wasActive || !this.activeBrandId) {
        this.activeBrandId = last.brandId
        this.repository.setActiveBrand(last.brandId)
      }
      this.lastDelete = null
      this.message = `已恢复品牌「${last.brandName}」`
      this.emit()
    } catch {
      this.fail('恢复失败，请稍后重试')
    }
  }

  /** 从回收站恢复品牌（不改变当前正在编辑的品牌） */
  restoreBrand(brandId: string): void {
    const entry = this.trashed.find((item) => item.record.id === brandId)
    if (!entry) return
    try {
      this.repository.restoreBrand(brandId)
      this.trashed = this.trashed.filter((item) => item.record.id !== brandId)
      this.brands = [...this.brands, entry.record]
      if (!this.activeBrandId) {
        this.activeBrandId = brandId
        this.repository.setActiveBrand(brandId)
      }
      this.message = `已恢复品牌「${entry.record.name}」`
      this.emit()
    } catch {
      this.fail('恢复失败，请稍后重试')
    }
  }

  // ---------- 当前品牌的令牌编辑 ----------

  selectTheme(theme: BrandTheme): void {
    this.update({ tokens: themeTokens(theme), theme }, '已切换基础主题')
  }

  updateColor(field: 'primary' | 'secondary', value: string): void {
    const color = normalizeColor(value)
    this.update({ tokens: { ...this.requireDocument().tokens, [field]: color } }, '令牌已更新')
  }

  updateScale(field: 'radiusScale' | 'spacingScale' | 'typeScale', index: number, value: number): void {
    const current = this.requireDocument()
    const values = [...current.tokens[field]]
    values[index] = Number.isFinite(value) ? value : values[index]
    this.update({ tokens: clampTokenValues({ ...current.tokens, [field]: values }) }, '令牌已更新')
  }

  reset(): void {
    this.update({ tokens: cloneTokens(INITIAL_TOKENS), theme: 'studio' }, '已恢复默认令牌')
  }

  saveVersion(): void {
    const current = this.getActiveBrand()
    if (!current) return
    const document = current.document
    const validationError = validateTokens(document.tokens)
    if (validationError) {
      this.status = 'error'
      this.message = validationError
      this.emit()
      return
    }
    const nextVersion: SavedVersion = {
      id: makeVersionId(),
      label: document.versions.length === 0 ? 'Version A' : `Version ${String.fromCharCode(65 + document.versions.length)}`,
      tokens: cloneTokens(document.tokens),
      createdAt: new Date().toISOString(),
    }
    this.persistActive({ ...document, versions: [...document.versions, nextVersion] }, '版本已保存', 'ready')
  }

  toggleCompare(): void {
    this.compareMode = !this.compareMode
    this.message = this.compareMode ? '正在对比最近两个版本' : '已退出对比模式'
    this.emit()
  }

  exportBrandGuidelines(): void {
    if (!this.exporter) return
    try {
      this.exporter.export(this.getSnapshot())
      this.message = '品牌规范已导出'
    } catch {
      this.status = 'error'
      this.message = '导出失败，请稍后重试'
    }
    this.emit()
  }

  // ---------- 内部辅助 ----------

  private update(partial: Partial<Pick<BrandDocument, 'tokens' | 'theme'>>, message: string): void {
    const current = this.getActiveBrand()
    if (!current) return
    const nextDocument: BrandDocument = {
      ...current.document,
      tokens: partial.tokens ?? current.document.tokens,
      theme: partial.theme ?? current.document.theme,
    }
    this.mutateActive(nextDocument)
    this.status = 'editing'
    this.message = message
    this.persistActive(nextDocument, message, 'editing', true)
  }

  private persistActive(document: BrandDocument, message: string, status: BrandMirrorSnapshot['status'], keepEditing = false): void {
    const current = this.getActiveBrand()
    if (!current) return
    const record: BrandRecord = { ...current, document, updatedAt: new Date().toISOString() }
    try {
      this.repository.saveBrand(record)
      this.brands = this.brands.map((brand) => (brand.id === record.id ? record : brand))
      this.status = status
      this.message = message
    } catch {
      this.status = 'error'
      this.message = keepEditing ? '本地保存失败，但当前编辑仍保留在页面中' : '版本保存失败，请稍后重试'
    }
    this.emit()
  }

  private mutateActive(document: BrandDocument): void {
    const current = this.getActiveBrand()
    if (!current) return
    const record: BrandRecord = { ...current, document }
    this.brands = this.brands.map((brand) => (brand.id === record.id ? record : brand))
  }

  private performSwitch(brandId: string, message: string): void {
    const target = this.brands.find((brand) => brand.id === brandId)
    if (!target) return
    this.activeBrandId = brandId
    this.compareMode = false
    this.status = 'ready'
    this.message = message
    try {
      this.repository.setActiveBrand(brandId)
    } catch {
      this.status = 'error'
      this.message = `${message}（但记住当前品牌失败）`
    }
    this.emit()
  }

  private switchTo(brandId: string, message: string): void {
    this.activeBrandId = brandId
    this.compareMode = false
    this.status = 'ready'
    this.message = message
    try {
      this.repository.setActiveBrand(brandId)
    } catch {
      this.status = 'error'
    }
    this.emit()
  }

  private fail(message: string): void {
    this.status = 'error'
    this.message = message
    this.emit()
  }

  private getActiveBrand(): BrandRecord | null {
    return this.brands.find((brand) => brand.id === this.activeBrandId) ?? null
  }

  private requireDocument(): BrandDocument {
    const brand = this.getActiveBrand()
    return brand ? brand.document : { version: 1, tokens: cloneTokens(INITIAL_TOKENS), theme: 'studio', versions: [] }
  }

  private resolveBrand(brandId?: string): BrandRecord | null {
    if (brandId) return this.brands.find((brand) => brand.id === brandId) ?? null
    return this.getActiveBrand()
  }

  private librarySnapshot(): BrandLibrarySnapshot {
    return {
      brands: this.brands.map(toSummary),
      activeBrandId: this.activeBrandId,
      activeBrandName: this.getActiveBrand()?.name ?? null,
      trashedBrands: this.trashed,
      pendingAction: this.pendingAction,
      canUndoDelete: this.lastDelete !== null && this.trashed.some((item) => item.record.id === this.lastDelete?.brandId),
      lastDeletedName: this.lastDelete?.brandName ?? null,
    }
  }

  private normalizeBrandName(rawName?: string): string | null {
    const name = rawName?.trim()
    if (!name) return null
    return name.slice(0, 24)
  }

  private uniqueName(base: string): string {
    const used = new Set(this.brands.map((brand) => brand.name))
    if (!used.has(base)) return base
    let counter = 2
    while (used.has(`${base} ${counter}`)) counter += 1
    return `${base} ${counter}`
  }

  private duplicateName(sourceName: string): string {
    const base = sourceName.length > 20 ? `${sourceName.slice(0, 20)}… 副本` : `${sourceName} 副本`
    return this.uniqueName(base)
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener())
  }
}

function toSummary(record: BrandRecord): BrandSummary {
  return {
    id: record.id,
    name: record.name,
    primary: record.document.tokens.primary,
    secondary: record.document.tokens.secondary,
    versionCount: record.document.versions.length,
    updatedAt: record.updatedAt,
  }
}

function cloneDocument(document: BrandDocument): BrandDocument {
  return {
    version: 1,
    theme: document.theme,
    tokens: cloneTokens(document.tokens),
    versions: document.versions.map((version) => ({ ...version, tokens: cloneTokens(version.tokens) })),
  }
}

function makeVersionId(): string {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10)
  return `version-${Date.now().toString(36)}-${suffix}`
}
