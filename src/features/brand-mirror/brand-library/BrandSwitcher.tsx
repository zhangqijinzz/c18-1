import { useEffect, useRef, useState } from 'react'
import type { BrandMirrorSnapshot } from '../models/brandMirrorModels'

interface BrandSwitcherProps {
  snapshot: BrandMirrorSnapshot
  onSwitch: (brandId: string) => void
  onDuplicate: (brandId: string) => void
  onDelete: (brandId: string) => void
  onCreate: () => void
  onOpenManager: () => void
}

export function BrandSwitcher({ snapshot, onSwitch, onDuplicate, onDelete, onCreate, onOpenManager }: BrandSwitcherProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handlePointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handlePointer)
    return () => document.removeEventListener('mousedown', handlePointer)
  }, [open])

  const activeName = snapshot.activeBrandName ?? '未选择品牌'

  return (
    <div className="brand-switcher" ref={rootRef}>
      <button type="button" className="brand-switcher-button" onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open}>
        <span className="switcher-swatch" style={{ background: `linear-gradient(135deg, ${snapshot.tokens.primary} 50%, ${snapshot.tokens.secondary} 50%)` }} />
        <span className="switcher-text"><small>当前品牌</small><strong>{activeName}</strong></span>
        <span className={`switcher-chevron ${open ? 'open' : ''}`}>⌄</span>
      </button>

      {open && (
        <div className="brand-dropdown" role="menu">
          <div className="brand-dropdown-head">
            <span>品牌库</span>
            <span className="count-badge">{snapshot.brands.length} 个品牌</span>
          </div>
          <div className="brand-dropdown-list">
            {snapshot.brands.map((brand) => (
              <div className={`brand-dropdown-item ${brand.id === snapshot.activeBrandId ? 'active' : ''}`} key={brand.id} role="menuitem">
                <button type="button" className="brand-item-main" onClick={() => { setOpen(false); onSwitch(brand.id) }} title={`切换到 ${brand.name}`}>
                  <span className="switcher-swatch small" style={{ background: `linear-gradient(135deg, ${brand.primary} 50%, ${brand.secondary} 50%)` }} />
                  <span><strong>{brand.name}</strong><small>{brand.versionCount} 个版本 · 更新于 {brand.updatedAt.slice(0, 10)}</small></span>
                  {brand.id === snapshot.activeBrandId && <span className="check-mark">✓</span>}
                </button>
                <div className="brand-item-actions">
                  <button type="button" aria-label={`复制 ${brand.name}`} title="复制为新品牌" onClick={() => { setOpen(false); onDuplicate(brand.id) }}>⧉</button>
                  <button type="button" className="danger-text" aria-label={`删除 ${brand.name}`} title="删除（可在回收站恢复）" onClick={() => { setOpen(false); onDelete(brand.id) }}>🗑</button>
                </div>
              </div>
            ))}
            {snapshot.brands.length === 0 && (
              <div className="brand-dropdown-empty">品牌库为空，先新建一个品牌</div>
            )}
          </div>
          <div className="brand-dropdown-footer">
            <button type="button" className="secondary-button" onClick={() => { setOpen(false); onCreate() }}>＋ 新建品牌</button>
            <button type="button" className="text-button" onClick={() => { setOpen(false); onOpenManager() }}>管理品牌库 / 回收站{trashBadge(snapshot)}</button>
          </div>
        </div>
      )}
    </div>
  )
}

function trashBadge(snapshot: BrandMirrorSnapshot): string {
  return snapshot.trashedBrands.length > 0 ? `（${snapshot.trashedBrands.length}）` : ''
}
