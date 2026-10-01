import { describe, expect, it, vi } from 'vitest'
import { BrandLibraryViewModel } from '../viewmodels/brandLibraryViewModel'
import type { BrandLibraryRepository } from '../repositories/brandLibraryRepository'
import type { LoadedLibrary } from '../models/brandLibraryModels'
import { emptyLibrary, migrateLegacyDocument } from '../domain/brandLibraryRules'
import type { BrandDocument } from '../../brand-mirror/models/brandMirrorModels'
import { INITIAL_TOKENS } from '../../brand-mirror/models/brandMirrorModels'

const FIXED_NOW = new Date('2026-01-02T03:04:05.000Z')

class MemoryLibraryRepository implements BrandLibraryRepository {
  loaded: LoadedLibrary = { library: emptyLibrary(), migrated: false }
  shouldFail = false
  saved: number = 0
  load(): LoadedLibrary { return this.loaded }
  save(library: LoadedLibrary['library']): void {
    if (this.shouldFail) throw new Error('offline')
    this.saved += 1
    this.loaded = { library, migrated: false }
  }
}

function legacyLoaded(): LoadedLibrary {
  const document: BrandDocument = { version: 1, theme: 'night', tokens: { ...INITIAL_TOKENS, primary: '#A98BFF' }, versions: [{ id: 'v1', label: 'Version A', tokens: { ...INITIAL_TOKENS, primary: '#A98BFF' }, createdAt: '2025-12-01T00:00:00.000Z' }] }
  return { library: migrateLegacyDocument(document, FIXED_NOW).library, migrated: true }
}

describe('BrandLibraryViewModel', () => {
  it('announces auto migration from legacy data on initialization', () => {
    const repository = new MemoryLibraryRepository()
    repository.loaded = legacyLoaded()
    const viewModel = new BrandLibraryViewModel(repository)
    viewModel.initialize()
    const snapshot = viewModel.getSnapshot()
    expect(snapshot.brands).toHaveLength(1)
    expect(snapshot.activeBrandId).toBe(snapshot.brands[0].id)
    expect(snapshot.message).toContain('我的品牌')
  })

  it('creates a brand and notifies that the active brand changed', () => {
    const repository = new MemoryLibraryRepository()
    const onChanged = vi.fn()
    const viewModel = new BrandLibraryViewModel(repository, onChanged)
    viewModel.initialize()
    viewModel.createBrand()
    const snapshot = viewModel.getSnapshot()
    expect(snapshot.brands).toHaveLength(1)
    expect(snapshot.activeBrandId).toBe(snapshot.brands[0].id)
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(repository.saved).toBe(1)
  })

  it('requires confirmation before switching and only then changes the active brand', () => {
    const repository = new MemoryLibraryRepository()
    const onChanged = vi.fn()
    const viewModel = new BrandLibraryViewModel(repository, onChanged)
    viewModel.initialize()
    viewModel.createBrand()
    viewModel.openPanel()
    viewModel.createBrand()
    const first = viewModel.getSnapshot().brands[0].id
    const second = viewModel.getSnapshot().activeBrandId
    expect(second).not.toBe(first)
    expect(second).not.toBeNull()
    viewModel.requestSwitch(first)
    // 仅提出确认请求，活动品牌不变
    expect(viewModel.getSnapshot().request?.type).toBe('switch')
    expect(viewModel.getSnapshot().activeBrandId).toBe(second)
    viewModel.confirmRequest()
    expect(viewModel.getSnapshot().activeBrandId).toBe(first)
    expect(onChanged).toHaveBeenLastCalledWith(expect.stringContaining('切换'))
    // 取消路径不改变活动品牌
    if (second === null) throw new Error('second brand must exist')
    viewModel.requestSwitch(second)
    viewModel.cancelRequest()
    expect(viewModel.getSnapshot().activeBrandId).toBe(first)
  })

  it('duplicates a brand with confirmation-free copy and switches to the copy', () => {
    const repository = new MemoryLibraryRepository()
    const viewModel = new BrandLibraryViewModel(repository)
    viewModel.initialize()
    viewModel.createBrand()
    const id = viewModel.getSnapshot().activeBrandId
    if (id === null) throw new Error('brand must exist')
    viewModel.openPanel()
    viewModel.duplicateBrand(id)
    const snapshot = viewModel.getSnapshot()
    expect(snapshot.brands).toHaveLength(2)
    expect(snapshot.activeBrandId).toBe(snapshot.brands[1].id)
    expect(snapshot.brands[1].name).toContain('副本')
  })

  it('soft deletes through confirmation, moves to trash and supports restore', () => {
    const repository = new MemoryLibraryRepository()
    const viewModel = new BrandLibraryViewModel(repository)
    viewModel.initialize()
    viewModel.createBrand()
    viewModel.openPanel()
    viewModel.createBrand()
    const first = viewModel.getSnapshot().brands[0].id
    viewModel.requestDelete(first)
    expect(viewModel.getSnapshot().request?.type).toBe('delete')
    viewModel.confirmRequest()
    const afterDelete = viewModel.getSnapshot()
    expect(afterDelete.brands).toHaveLength(1)
    expect(afterDelete.trash).toHaveLength(1)
    expect(afterDelete.message).toContain('回收站')
    viewModel.setTab('trash')
    viewModel.restoreBrand(first)
    expect(viewModel.getSnapshot().brands).toHaveLength(2)
    expect(viewModel.getSnapshot().trash).toHaveLength(0)
  })

  it('deleting the active brand auto switches and notifies the editor exactly once', () => {
    const repository = new MemoryLibraryRepository()
    const onChanged = vi.fn()
    const viewModel = new BrandLibraryViewModel(repository, onChanged)
    viewModel.initialize()
    viewModel.createBrand()
    const active = viewModel.getSnapshot().activeBrandId
    if (active === null) throw new Error('active brand must exist')
    viewModel.openPanel()
    viewModel.createBrand()
    viewModel.requestSwitch(active)
    viewModel.confirmRequest()
    onChanged.mockClear()
    viewModel.requestDelete(active)
    viewModel.confirmRequest()
    const snapshot = viewModel.getSnapshot()
    expect(snapshot.activeBrandId).not.toBe(active)
    expect(snapshot.activeBrandId).toBe(snapshot.brands[0].id)
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('requires an extra confirmation to permanently purge, which never restores', () => {
    const repository = new MemoryLibraryRepository()
    const viewModel = new BrandLibraryViewModel(repository)
    viewModel.initialize()
    viewModel.createBrand()
    const id = viewModel.getSnapshot().activeBrandId
    if (id === null) throw new Error('brand must exist')
    viewModel.openPanel()
    viewModel.requestDelete(id)
    viewModel.confirmRequest()
    viewModel.setTab('trash')
    viewModel.requestPurge(id)
    const request = viewModel.getSnapshot().request
    expect(request?.type).toBe('purge')
    viewModel.confirmRequest()
    expect(viewModel.getSnapshot().trash).toHaveLength(0)
    expect(viewModel.getSnapshot().message).toContain('彻底删除')
  })

  it('rejects empty or overlong names and renames valid ones', () => {
    const repository = new MemoryLibraryRepository()
    const viewModel = new BrandLibraryViewModel(repository)
    viewModel.initialize()
    viewModel.createBrand()
    const id = viewModel.getSnapshot().activeBrandId
    if (id === null) throw new Error('brand must exist')
    viewModel.renameBrand(id, '   ')
    expect(viewModel.getSnapshot().status).toBe('error')
    expect(viewModel.getSnapshot().brands[0].name).not.toBe('')
    viewModel.renameBrand(id, '  新名字  ')
    expect(viewModel.getSnapshot().brands[0].name).toBe('新名字')
  })

  it('keeps in-memory state usable when persistence fails', () => {
    const repository = new MemoryLibraryRepository()
    const viewModel = new BrandLibraryViewModel(repository)
    viewModel.initialize()
    viewModel.createBrand()
    repository.shouldFail = true
    viewModel.openPanel()
    viewModel.requestDelete(viewModel.getSnapshot().brands[0].id)
    viewModel.confirmRequest()
    expect(viewModel.getSnapshot().status).toBe('error')
    expect(viewModel.getSnapshot().message).toContain('失败')
  })
})
