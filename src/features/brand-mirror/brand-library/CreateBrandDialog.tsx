import { useEffect, useState } from 'react'
import type { BrandMirrorSnapshot } from '../models/brandMirrorModels'

interface CreateBrandDialogProps {
  snapshot: BrandMirrorSnapshot
  onCreateBlank: (name: string) => void
  onDuplicate: (brandId: string, name: string) => void
  onClose: () => void
}

type Mode = 'blank' | 'copy'

export function CreateBrandDialog({ snapshot, onCreateBlank, onDuplicate, onClose }: CreateBrandDialogProps) {
  const [mode, setMode] = useState<Mode>('blank')
  const [name, setName] = useState('')
  const [sourceId, setSourceId] = useState(snapshot.activeBrandId ?? snapshot.brands[0]?.id ?? '')
  const source = snapshot.brands.find((brand) => brand.id === sourceId)

  useEffect(() => {
    setName((current) => {
      if (current.trim()) return current
      return mode === 'copy' && source ? `${source.name} 副本` : ''
    })
  }, [mode, source])

  const canSubmit = mode === 'copy' ? !!source && name.trim().length > 0 : name.trim().length > 0

  const submit = () => {
    if (!canSubmit || !name.trim()) return
    if (mode === 'copy' && source) onDuplicate(source.id, name.trim().slice(0, 24))
    else onCreateBlank(name.trim().slice(0, 24))
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="library-dialog" role="dialog" aria-modal="true" aria-labelledby="create-brand-title">
        <div className="library-dialog-head">
          <div><span className="eyebrow">BRAND LIBRARY</span><h3 id="create-brand-title">新建品牌</h3></div>
          <button type="button" className="dialog-close" aria-label="关闭" onClick={onClose}>×</button>
        </div>

        <div className="create-mode-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'blank'} className={mode === 'blank' ? 'selected' : ''} onClick={() => setMode('blank')}>空白起点</button>
          <button type="button" role="tab" aria-selected={mode === 'copy'} className={mode === 'copy' ? 'selected' : ''} onClick={() => setMode('copy')} disabled={snapshot.brands.length === 0}>复制现有品牌</button>
        </div>

        {mode === 'copy' && (
          <div className="control-section-inner">
            <div className="section-label"><span>来源品牌</span><span className="muted">令牌 + 全部版本历史将被拷贝</span></div>
            <div className="theme-list">
              {snapshot.brands.map((brand) => (
                <button type="button" className={`theme-option ${sourceId === brand.id ? 'selected' : ''}`} key={brand.id} onClick={() => setSourceId(brand.id)}>
                  <span className="switcher-swatch small" style={{ background: `linear-gradient(135deg, ${brand.primary} 50%, ${brand.secondary} 50%)` }} />
                  <span><strong>{brand.name}</strong><small>{brand.versionCount} 个版本</small></span>
                  {sourceId === brand.id && <span className="check-mark">✓</span>}
                </button>
              ))}
            </div>
            <p className="copy-hint">复制后得到的新品牌与来源完全独立：之后的编辑、版本保存和删除互不影响。</p>
          </div>
        )}

        {mode === 'blank' && (
          <p className="copy-hint">新品牌从 Studio warm 令牌开始，拥有独立的版本历史，不会影响品牌库中的其它品牌。</p>
        )}

        <label className="create-name-field">
          <span>品牌名称</span>
          <input autoFocus value={name} maxLength={24} placeholder="例如：晨曦电商 / Aurora App" onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submit() }} />
        </label>

        <div className="confirm-actions">
          <button type="button" className="secondary-button" onClick={onClose}>取消</button>
          <button type="button" className="primary-button" disabled={!canSubmit} onClick={submit}>{mode === 'copy' ? '复制并创建' : '创建并切换'}</button>
        </div>
      </div>
    </div>
  )
}
