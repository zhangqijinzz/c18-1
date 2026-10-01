import { useEffect, useState } from 'react'
import type { BrandLibrarySnapshot, BrandSummary, ConfirmRequest, TrashedBrandSummary } from './viewmodels/brandLibraryViewModel'
import type { BrandLibraryViewModel } from './viewmodels/brandLibraryViewModel'
import { BRAND_NAME_LIMIT } from './models/brandLibraryModels'

interface BrandLibraryPanelProps {
  snapshot: BrandLibrarySnapshot
  viewModel: BrandLibraryViewModel
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function BrandSwatch({ primary, secondary }: { primary: string; secondary: string }) {
  return <span className="library-swatch" style={{ background: `linear-gradient(135deg, ${primary} 50%, ${secondary} 50%)` }} />
}

export function BrandLibraryPanel({ snapshot, viewModel }: BrandLibraryPanelProps) {
  if (!snapshot.panelOpen) return null
  return (
    <div className="library-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && viewModel.closePanel()}>
      <div className="library-dialog" role="dialog" aria-modal="true" aria-label="品牌库">
        <header className="library-head">
          <div>
            <span className="eyebrow">BRAND LIBRARY</span>
            <h2>品牌库</h2>
          </div>
          <button className="library-close" type="button" aria-label="关闭品牌库" onClick={() => viewModel.closePanel()}>×</button>
        </header>

        {snapshot.message && <div className={`library-toast ${snapshot.status === 'error' ? 'error' : ''}`}>{snapshot.message}</div>}

        <div className="library-tabs">
          <button className={snapshot.tab === 'brands' ? 'active' : ''} type="button" onClick={() => viewModel.setTab('brands')}>我的品牌 · {snapshot.brands.length}</button>
          <button className={snapshot.tab === 'trash' ? 'active' : ''} type="button" onClick={() => viewModel.setTab('trash')}>回收站 · {snapshot.trash.length}</button>
        </div>

        {snapshot.tab === 'brands' ? (
          snapshot.brands.length > 0 ? (
            <div className="library-list">
              {snapshot.brands.map((brand) => (
                <BrandRow key={brand.id} brand={brand} active={brand.id === snapshot.activeBrandId} viewModel={viewModel} disabled={!!snapshot.request} />
              ))}
            </div>
          ) : (
            <div className="library-empty"><div className="empty-icon">✦</div><div><strong>还没有品牌</strong><p>新建一个品牌开始创作，或到回收站恢复之前删除的品牌。</p></div></div>
          )
        ) : snapshot.trash.length > 0 ? (
          <div className="library-list">
            {snapshot.trash.map((brand) => <TrashedRow key={brand.id} brand={brand} viewModel={viewModel} disabled={!!snapshot.request} />)}
          </div>
        ) : (
          <div className="library-empty"><div className="empty-icon">A/B</div><div><strong>回收站是空的</strong><p>删除的品牌会先进入这里，可以随时恢复。</p></div></div>
        )}

        <footer className="library-foot">
          <p>每个品牌独立保存令牌与版本历史，互不覆盖。删除会先进入回收站。</p>
          {snapshot.tab === 'brands' && <button className="primary-button" type="button" disabled={!!snapshot.request} onClick={() => viewModel.createBrand()}>＋ 新建品牌</button>}
        </footer>

        {snapshot.request && <ConfirmDialog request={snapshot.request} onCancel={() => viewModel.cancelRequest()} onConfirm={() => viewModel.confirmRequest()} />}
      </div>
    </div>
  )
}

function BrandRow({ brand, active, viewModel, disabled }: { brand: BrandSummary; active: boolean; viewModel: BrandLibraryViewModel; disabled: boolean }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(brand.name)
  useEffect(() => setDraft(brand.name), [brand.name])

  const commitRename = () => {
    setEditing(false)
    if (draft.trim() !== brand.name) viewModel.renameBrand(brand.id, draft)
    else setDraft(brand.name)
  }

  return (
    <div className={`library-row ${active ? 'active' : ''}`}>
      <BrandSwatch primary={brand.primary} secondary={brand.secondary} />
      <div className="library-row-main">
        {editing ? (
          <input
            className="library-name-input"
            aria-label="品牌名称"
            value={draft}
            maxLength={BRAND_NAME_LIMIT}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitRename()
              if (event.key === 'Escape') {
                setDraft(brand.name)
                setEditing(false)
              }
            }}
          />
        ) : (
          <button className="library-name" type="button" disabled={disabled} title="点击切换到此品牌" onClick={() => viewModel.requestSwitch(brand.id)}>
            <strong>{brand.name}</strong>
            {active && <span className="library-current">当前使用中</span>}
          </button>
        )}
        <small>{brand.versionCount} 个保存版本 · 更新于 {formatDate(brand.updatedAt)}</small>
      </div>
      <div className="library-row-actions">
        <button type="button" disabled={disabled} onClick={() => setEditing(true)}>重命名</button>
        <button type="button" disabled={disabled} onClick={() => viewModel.duplicateBrand(brand.id)}>复制</button>
        <button type="button" className="danger" disabled={disabled} onClick={() => viewModel.requestDelete(brand.id)}>删除</button>
      </div>
    </div>
  )
}

function TrashedRow({ brand, viewModel, disabled }: { brand: TrashedBrandSummary; viewModel: BrandLibraryViewModel; disabled: boolean }) {
  return (
    <div className="library-row trashed">
      <BrandSwatch primary={brand.primary} secondary={brand.secondary} />
      <div className="library-row-main">
        <strong>{brand.name}</strong>
        <small>{brand.versionCount} 个保存版本 · 删除于 {formatDate(brand.trashedAt)}</small>
      </div>
      <div className="library-row-actions">
        <button type="button" disabled={disabled} onClick={() => viewModel.restoreBrand(brand.id)}>恢复</button>
        <button type="button" className="danger" disabled={disabled} onClick={() => viewModel.requestPurge(brand.id)}>彻底删除</button>
      </div>
    </div>
  )
}

function ConfirmDialog({ request, onCancel, onConfirm }: { request: ConfirmRequest; onCancel: () => void; onConfirm: () => void }) {
  const content = (() => {
    if (request.type === 'switch') {
      return {
        title: `切换到「${request.name}」？`,
        body: '当前品牌的所有改动已实时保存到该品牌自己的空间，切换不会丢失任何数据。',
        confirm: '确认切换',
        danger: false,
      }
    }
    if (request.type === 'delete') {
      return {
        title: `删除品牌「${request.name}」？`,
        body: request.active
          ? '该品牌当前正在使用，删除后会自动切换到其它品牌。品牌会先进入回收站，可随时恢复，且不会影响其它品牌的任何数据。'
          : '品牌会先进入回收站，可随时恢复，且不会影响其它品牌的任何数据。',
        confirm: '移入回收站',
        danger: true,
      }
    }
    return {
      title: `彻底删除「${request.name}」？`,
      body: '此操作不可恢复，该品牌的全部令牌与版本历史都会被永久清除。其它品牌不受影响。',
      confirm: '彻底删除',
      danger: true,
    }
  })()

  return (
    <div className="confirm-overlay" role="alertdialog" aria-modal="true" aria-label={content.title}>
      <div className="confirm-dialog">
        <h3>{content.title}</h3>
        <p>{content.body}</p>
        <div className="confirm-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>取消</button>
          <button className={content.danger ? 'danger-button' : 'primary-button'} type="button" onClick={onConfirm}>{content.confirm}</button>
        </div>
      </div>
    </div>
  )
}
