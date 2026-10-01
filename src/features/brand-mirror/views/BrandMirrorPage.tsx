import { useState } from 'react'
import type { BrandMirrorViewModel } from '../viewmodels/brandMirrorViewModel'
import { useBrandMirrorViewModel } from '../hooks/useBrandMirrorViewModel'
import { ComponentGallery } from '../preview-gallery/ComponentGallery'
import { PageGallery } from '../preview-gallery/PageGallery'
import { TokenControls } from '../token-editor/TokenControls'
import { TokenExplorer } from '../token-search/TokenExplorer'
import { VersionCompare } from '../versioning/VersionCompare'
import { BrandSwitcher } from '../brand-library/BrandSwitcher'
import { BrandManager } from '../brand-library/BrandManager'
import { CreateBrandDialog } from '../brand-library/CreateBrandDialog'
import { ConfirmDialog } from '../brand-library/ConfirmDialog'
import { EmptyWorkspace } from '../brand-library/EmptyWorkspace'

type Modal = 'none' | 'create' | 'manager'

export function BrandMirrorPage({ viewModel }: { viewModel: BrandMirrorViewModel }) {
  const snapshot = useBrandMirrorViewModel(viewModel)
  const [modal, setModal] = useState<Modal>('none')
  const hasActiveBrand = snapshot.activeBrandId !== null

  return <div className="app-shell"><header className="topbar"><div className="brand-lockup"><span className="brand-mark">✦</span><span>BrandMirror</span><span className="brand-subtitle">品牌视觉实验室</span></div><div className="topbar-right"><BrandSwitcher snapshot={snapshot} onSwitch={(brandId) => viewModel.requestSwitchBrand(brandId)} onDuplicate={(brandId) => viewModel.duplicateBrand(brandId)} onDelete={(brandId) => viewModel.requestDeleteBrand(brandId)} onCreate={() => setModal('create')} onOpenManager={() => setModal('manager')} /><span className="save-state"><span className="live-dot" />{snapshot.status === 'error' ? '本地保存需检查' : '所有更改已保存'}</span><span className="avatar-small">M</span></div></header>
    {hasActiveBrand ? (
      <main className="workspace"><div><TokenControls snapshot={snapshot} onThemeChange={(theme) => viewModel.selectTheme(theme)} onColorChange={(field, value) => viewModel.updateColor(field, value)} onScaleChange={(field, index, value) => viewModel.updateScale(field, index, value)} onReset={() => viewModel.reset()} /><TokenExplorer tokens={snapshot.tokens} /></div><div className="preview-area"><div className="hero-heading"><div><span className="eyebrow">BRAND SYSTEM / 2024</span><h1>一套令牌，<em>无限可能。</em></h1><p className="active-brand-line">当前品牌：<strong>{snapshot.activeBrandName}</strong> · 调整左侧令牌，观察它们如何在不同组件和页面中保持一致。</p></div><div className="feedback-toast"><span className="toast-icon">✦</span><span><strong>{snapshot.message || '准备开始探索'}</strong><small>{snapshot.canUndoDelete ? <button type="button" className="undo-link" onClick={() => viewModel.undoLastDelete()}>撤销删除「{snapshot.lastDeletedName}」</button> : '实时视觉反馈'}</small></span></div></div><ComponentGallery tokens={snapshot.tokens} /><PageGallery tokens={snapshot.tokens} /><VersionCompare snapshot={snapshot} onSave={() => viewModel.saveVersion()} onToggle={() => viewModel.toggleCompare()} onExport={() => viewModel.exportBrandGuidelines()} /></div></main>
    ) : (
      <main className="workspace single"><EmptyWorkspace onCreate={() => setModal('create')} onOpenManager={() => setModal('manager')} hasTrashed={snapshot.trashedBrands.length > 0} /></main>
    )}
    <footer className="bottom-status"><span><span className="live-dot" />已连接到本地工作区</span><span>BrandMirror v0.2 <span className="footer-sep">·</span> 品牌库 · 本地优先</span></footer>
    {modal === 'create' && <CreateBrandDialog snapshot={snapshot} onCreateBlank={(name) => { viewModel.createBrand(name); setModal('none') }} onDuplicate={(brandId, name) => { viewModel.duplicateBrand(brandId, name); setModal('none') }} onClose={() => setModal('none')} />}
    {modal === 'manager' && <BrandManager snapshot={snapshot} onSwitch={(brandId) => { viewModel.requestSwitchBrand(brandId) }} onDuplicate={(brandId) => viewModel.duplicateBrand(brandId)} onDelete={(brandId) => viewModel.requestDeleteBrand(brandId)} onRestore={(brandId) => viewModel.restoreBrand(brandId)} onPurge={(brandId) => viewModel.requestPurgeBrand(brandId)} onCreate={() => setModal('create')} onClose={() => setModal('none')} />}
    {snapshot.pendingAction && <ConfirmDialog action={snapshot.pendingAction} onConfirm={() => viewModel.confirmPendingAction()} onCancel={() => viewModel.cancelPendingAction()} />}
  </div>
}
