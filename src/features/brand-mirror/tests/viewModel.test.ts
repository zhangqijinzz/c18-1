import { describe, expect, it } from 'vitest'
import { BrandMirrorViewModel } from '../viewmodels/brandMirrorViewModel'
import type { BrandMirrorSnapshot } from '../models/brandMirrorModels'
import { LocalBrandLibraryRepository, BRAND_KEY_PREFIX } from '../repositories/brandRepository'
import type { StorageService } from '../services/storageService'
import { LEGACY_DOCUMENT_KEY } from '../services/storageService'
import type { BrandDocument } from '../models/brandMirrorModels'
import { INITIAL_TOKENS } from '../models/brandMirrorModels'
import { buildBrandGuidelinesMarkdown, type BrandGuidelinesExporter } from '../services/exportService'

class MemoryStorage implements StorageService {
  values = new Map<string, string>()
  failing = false
  read(key: string): string | null {
    const value = this.values.get(key)
    return value === undefined ? null : value
  }
  write(key: string, value: string): void { if (this.failing) throw new Error('offline'); this.values.set(key, value) }
  remove(key: string): void { this.values.delete(key) }
  brandKeys(): string[] { return [...this.values.keys()].filter((key) => key.startsWith(BRAND_KEY_PREFIX)) }
}

function setup(storage = new MemoryStorage()) {
  const repository = new LocalBrandLibraryRepository(storage)
  return { storage, repository, viewModel: new BrandMirrorViewModel(repository) }
}

function brandId(snapshot: BrandMirrorSnapshot, name: string): string {
  const found = snapshot.brands.find((brand) => brand.name === name)
  if (!found) throw new Error(`缺少品牌：${name}`)
  return found.id
}

const NIGHT_DOCUMENT: BrandDocument = { version: 1, theme: 'night', tokens: { primary: '#A98BFF', secondary: '#191829', radiusScale: [6, 10, 14, 22], spacingScale: [4, 8, 12, 18, 28], typeScale: [12, 14, 16, 20, 28, 38] }, versions: [] }

describe('BrandMirrorViewModel 品牌库', () => {
  it('首次使用时品牌库为空，新建品牌后进入可编辑状态', () => {
    const { viewModel } = setup()
    viewModel.initialize()
    expect(viewModel.getSnapshot().activeBrandId).toBeNull()
    expect(viewModel.getSnapshot().brands).toEqual([])

    viewModel.createBrand('晨曦电商')
    const snapshot = viewModel.getSnapshot()
    expect(snapshot.activeBrandName).toBe('晨曦电商')
    expect(snapshot.tokens.primary).toBe(INITIAL_TOKENS.primary)
  })

  it('编辑令牌并持久化到当前品牌', () => {
    const { viewModel } = setup()
    viewModel.initialize()
    viewModel.createBrand('品牌 A')
    viewModel.updateColor('primary', '#123456')
    viewModel.updateScale('typeScale', 0, 18)
    expect(viewModel.getSnapshot().tokens.primary).toBe('#123456')
    expect(viewModel.getSnapshot().tokens.typeScale[0]).toBe(18)
    // 重新加载后数据仍在
    viewModel.initialize()
    expect(viewModel.getSnapshot().activeBrandName).toBe('品牌 A')
    expect(viewModel.getSnapshot().tokens.primary).toBe('#123456')
  })

  it('每个品牌独立保存版本历史，互不覆盖', () => {
    const { viewModel } = setup()
    viewModel.initialize()
    viewModel.createBrand('品牌 A')
    viewModel.saveVersion()
    viewModel.updateColor('primary', '#238B73')
    viewModel.saveVersion()
    expect(viewModel.getSnapshot().versions.map((version) => version.label)).toEqual(['Version A', 'Version B'])

    viewModel.createBrand('品牌 B')
    expect(viewModel.getSnapshot().versions).toEqual([])
    viewModel.saveVersion()
    expect(viewModel.getSnapshot().versions.map((version) => version.label)).toEqual(['Version A'])

    // 切回 A：版本历史原样保留
    viewModel.requestSwitchBrand(brandId(viewModel.getSnapshot(), '品牌 A'))
    viewModel.confirmPendingAction()
    expect(viewModel.getSnapshot().activeBrandName).toBe('品牌 A')
    expect(viewModel.getSnapshot().versions.map((version) => version.label)).toEqual(['Version A', 'Version B'])
    expect(viewModel.getSnapshot().tokens.primary).toBe('#238B73')
  })

  it('切换品牌前必须先确认，取消后留在当前品牌', () => {
    const { viewModel } = setup()
    viewModel.initialize()
    viewModel.createBrand('品牌 A')
    viewModel.createBrand('品牌 B')
    const brandAId = brandId(viewModel.getSnapshot(), '品牌 A')

    viewModel.requestSwitchBrand(brandAId)
    expect(viewModel.getSnapshot().pendingAction?.kind).toBe('switch')
    viewModel.cancelPendingAction()
    expect(viewModel.getSnapshot().activeBrandName).toBe('品牌 B')
  })

  it('复制品牌会拷贝令牌与全部版本，且副本与来源完全独立', () => {
    const { viewModel } = setup()
    viewModel.initialize()
    viewModel.createBrand('来源品牌')
    viewModel.saveVersion()
    const sourceId = viewModel.getSnapshot().activeBrandId
    expect(sourceId).not.toBeNull()

    viewModel.duplicateBrand(sourceId ?? '', '复制品牌')
    expect(viewModel.getSnapshot().activeBrandName).toBe('复制品牌')
    expect(viewModel.getSnapshot().versions).toHaveLength(1)

    viewModel.updateColor('primary', '#FF0000')
    viewModel.saveVersion()

    if (!sourceId) throw new Error('来源品牌不存在')
    const source = viewModel.getSnapshot().brands.find((brand) => brand.id === sourceId)
    expect(source?.versionCount).toBe(1)
    expect(source?.primary).not.toBe('#FF0000')
  })

  it('删除品牌需要确认，确认后进入回收站并可撤销恢复', () => {
    const { viewModel } = setup()
    viewModel.initialize()
    viewModel.createBrand('将被删除')
    viewModel.saveVersion()
    const victimId = viewModel.getSnapshot().activeBrandId
    viewModel.createBrand('保留品牌')

    if (!victimId) throw new Error('被删品牌不存在')
    viewModel.requestDeleteBrand(victimId)
    expect(viewModel.getSnapshot().pendingAction?.kind).toBe('delete')
    viewModel.confirmPendingAction()

    const afterDelete = viewModel.getSnapshot()
    expect(afterDelete.brands.some((brand) => brand.id === victimId)).toBe(false)
    expect(afterDelete.trashedBrands).toHaveLength(1)
    expect(afterDelete.canUndoDelete).toBe(true)
    expect(afterDelete.activeBrandName).toBe('保留品牌')

    viewModel.undoLastDelete()
    const afterUndo = viewModel.getSnapshot()
    expect(afterUndo.brands.some((brand) => brand.id === victimId)).toBe(true)
    expect(afterUndo.trashedBrands).toHaveLength(0)

    // 恢复后版本历史仍在
    viewModel.requestSwitchBrand(victimId)
    viewModel.confirmPendingAction()
    expect(viewModel.getSnapshot().versions).toHaveLength(1)
  })

  it('删除一个品牌不会影响其它品牌的存储数据', () => {
    const { storage, viewModel } = setup()
    viewModel.initialize()
    viewModel.createBrand('品牌 A')
    viewModel.updateColor('primary', '#111111')
    const brandAId = viewModel.getSnapshot().activeBrandId
    viewModel.createBrand('品牌 B')
    viewModel.updateColor('primary', '#222222')
    const brandBId = viewModel.getSnapshot().activeBrandId

    if (!brandAId || !brandBId) throw new Error('测试品牌未创建成功')
    viewModel.requestDeleteBrand(brandAId)
    viewModel.confirmPendingAction()

    // 品牌 B 自己的 key 与内容原样保留
    expect(storage.brandKeys()).toEqual([`${BRAND_KEY_PREFIX}${brandBId}`])
    const raw = storage.read(`${BRAND_KEY_PREFIX}${brandBId}`)
    expect(raw).not.toBeNull()
    const brandBRecord = JSON.parse(raw ?? '{}')
    expect(brandBRecord.document.tokens.primary).toBe('#222222')
  })

  it('回收站恢复不改变当前正在编辑的品牌；也可二次确认后永久删除', () => {
    const { viewModel } = setup()
    viewModel.initialize()
    viewModel.createBrand('被删品牌')
    const victimId = viewModel.getSnapshot().activeBrandId
    viewModel.createBrand('当前品牌')

    if (!victimId) throw new Error('被删品牌不存在')
    viewModel.requestDeleteBrand(victimId)
    viewModel.confirmPendingAction()
    viewModel.restoreBrand(victimId)
    expect(viewModel.getSnapshot().activeBrandName).toBe('当前品牌')
    expect(viewModel.getSnapshot().brands.some((brand) => brand.id === victimId)).toBe(true)

    viewModel.requestDeleteBrand(victimId)
    viewModel.confirmPendingAction()
    viewModel.requestPurgeBrand(victimId)
    expect(viewModel.getSnapshot().pendingAction?.kind).toBe('purge')
    viewModel.confirmPendingAction()
    const snapshot = viewModel.getSnapshot()
    expect(snapshot.trashedBrands).toHaveLength(0)
    expect(snapshot.brands.some((brand) => brand.id === victimId)).toBe(false)
    expect(snapshot.canUndoDelete).toBe(false)
  })

  it('升级时旧版单文档原样迁入一个新品牌，令牌与版本历史不改动', () => {
    const storage = new MemoryStorage()
    const versions = [{ id: 'version-old', label: 'Version A', tokens: { ...NIGHT_DOCUMENT.tokens }, createdAt: '2024-01-01T00:00:00.000Z' }]
    const legacy = { ...NIGHT_DOCUMENT, versions }
    storage.write(LEGACY_DOCUMENT_KEY, JSON.stringify(legacy))

    const { viewModel } = setup(storage)
    viewModel.initialize()
    const snapshot = viewModel.getSnapshot()
    expect(snapshot.brands).toHaveLength(1)
    expect(snapshot.activeBrandName).toBe('我的第一个品牌')
    expect(snapshot.theme).toBe('night')
    expect(snapshot.tokens).toEqual(NIGHT_DOCUMENT.tokens)
    expect(snapshot.versions).toEqual(versions)
    expect(snapshot.message).toContain('归入')
    // 旧 key 已被移除，不会重复迁移
    expect(storage.read(LEGACY_DOCUMENT_KEY)).toBeNull()
    viewModel.initialize()
    expect(viewModel.getSnapshot().brands).toHaveLength(1)
  })

  it('持久化失败时编辑仍保留在页面中并提示错误', () => {
    const storage = new MemoryStorage()
    const { viewModel } = setup(storage)
    viewModel.initialize()
    viewModel.createBrand('离线品牌')
    storage.failing = true
    viewModel.updateColor('secondary', '#FFFFFF')
    expect(viewModel.getSnapshot().status).toBe('error')
    expect(viewModel.getSnapshot().tokens.secondary).toBe('#FFFFFF')
  })

  it('导出的品牌规范包含当前品牌名', () => {
    class MemoryExporter implements BrandGuidelinesExporter {
      received = ''
      export(snapshot: Parameters<BrandGuidelinesExporter['export']>[0]): void { this.received = buildBrandGuidelinesMarkdown(snapshot) }
    }
    const repository = new LocalBrandLibraryRepository(new MemoryStorage())
    const exporter = new MemoryExporter()
    const viewModel = new BrandMirrorViewModel(repository, exporter)
    viewModel.initialize()
    viewModel.createBrand('导出品牌')
    viewModel.exportBrandGuidelines()
    expect(exporter.received).toContain('导出品牌')
    expect(exporter.received).toContain('`primary`')
    expect(viewModel.getSnapshot().message).toContain('导出')
  })
})
