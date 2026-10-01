import type { BrandMirrorSnapshot } from '../models/brandMirrorModels'

interface BrandManagerProps {
  snapshot: BrandMirrorSnapshot
  onSwitch: (brandId: string) => void
  onDuplicate: (brandId: string) => void
  onDelete: (brandId: string) => void
  onRestore: (brandId: string) => void
  onPurge: (brandId: string) => void
  onCreate: () => void
  onClose: () => void
}

export function BrandManager({ snapshot, onSwitch, onDuplicate, onDelete, onRestore, onPurge, onCreate, onClose }: BrandManagerProps) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="library-dialog wide" role="dialog" aria-modal="true" aria-labelledby="brand-manager-title">
        <div className="library-dialog-head">
          <div><span className="eyebrow">BRAND LIBRARY</span><h3 id="brand-manager-title">品牌库管理</h3></div>
          <button type="button" className="dialog-close" aria-label="关闭" onClick={onClose}>×</button>
        </div>

        <div className="manager-section">
          <div className="manager-section-head">
            <div className="section-label"><span>全部品牌</span><span className="muted">{snapshot.brands.length} 个 · 各自独立保存</span></div>
            <button type="button" className="secondary-button" onClick={onCreate}>＋ 新建品牌</button>
          </div>
          <div className="manager-list">
            {snapshot.brands.map((brand) => (
              <div className={`manager-row ${brand.id === snapshot.activeBrandId ? 'active' : ''}`} key={brand.id}>
                <span className="switcher-swatch" style={{ background: `linear-gradient(135deg, ${brand.primary} 50%, ${brand.secondary} 50%)` }} />
                <div className="manager-row-info">
                  <strong>{brand.name}{brand.id === snapshot.activeBrandId && <span className="active-pill">编辑中</span>}</strong>
                  <small>{brand.versionCount} 个保存版本 · 更新于 {formatDate(brand.updatedAt)}</small>
                </div>
                <div className="manager-row-actions">
                  <button type="button" className="text-button" disabled={brand.id === snapshot.activeBrandId} onClick={() => onSwitch(brand.id)}>{brand.id === snapshot.activeBrandId ? '当前品牌' : '切换'}</button>
                  <button type="button" className="text-button" onClick={() => onDuplicate(brand.id)}>复制</button>
                  <button type="button" className="text-button danger-text" onClick={() => onDelete(brand.id)}>删除</button>
                </div>
              </div>
            ))}
            {snapshot.brands.length === 0 && (
              <div className="manager-empty">品牌库中没有品牌，点击右上角「新建品牌」开始。</div>
            )}
          </div>
        </div>

        <div className="manager-section trash-section">
          <div className="manager-section-head">
            <div className="section-label"><span>回收站</span><span className="muted">{snapshot.trashedBrands.length} 个 · 删除可恢复，不影响其它品牌</span></div>
          </div>
          <div className="manager-list">
            {snapshot.trashedBrands.map((item) => (
              <div className="manager-row trashed" key={item.record.id}>
                <span className="switcher-swatch faded" style={{ background: `linear-gradient(135deg, ${item.record.document.tokens.primary} 50%, ${item.record.document.tokens.secondary} 50%)` }} />
                <div className="manager-row-info">
                  <strong>{item.record.name}</strong>
                  <small>{item.record.document.versions.length} 个版本 · 删除于 {formatDate(item.trashedAt)}</small>
                </div>
                <div className="manager-row-actions">
                  <button type="button" className="text-button" onClick={() => onRestore(item.record.id)}>恢复</button>
                  <button type="button" className="text-button danger-text" onClick={() => onPurge(item.record.id)}>彻底删除</button>
                </div>
              </div>
            ))}
            {snapshot.trashedBrands.length === 0 && (
              <div className="manager-empty subtle">回收站为空。删除品牌后会先保存在这里，随时可以恢复。</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
