import { useEffect } from 'react'
import type { BrandMirrorViewModel } from '../viewmodels/brandMirrorViewModel'
import { useBrandMirrorViewModel } from '../hooks/useBrandMirrorViewModel'
import type { BrandLibraryViewModel } from '../../brand-library/viewmodels/brandLibraryViewModel'
import { useBrandLibraryViewModel } from '../../brand-library/hooks/useBrandLibraryViewModel'
import { BrandLibraryPanel } from '../../brand-library/BrandLibraryPanel'
import { ComponentGallery } from '../preview-gallery/ComponentGallery'
import { PageGallery } from '../preview-gallery/PageGallery'
import { TokenControls } from '../token-editor/TokenControls'
import { TokenExplorer } from '../token-search/TokenExplorer'
import { VersionCompare } from '../versioning/VersionCompare'

interface BrandMirrorPageProps {
  viewModel: BrandMirrorViewModel
  libraryViewModel: BrandLibraryViewModel
}

export function BrandMirrorPage({ viewModel, libraryViewModel }: BrandMirrorPageProps) {
  const snapshot = useBrandMirrorViewModel(viewModel)
  const library = useBrandLibraryViewModel(libraryViewModel)

  const activeBrand = library.brands.find((brand) => brand.id === library.activeBrandId) ?? null
  // 品牌库初始化完成后载入活动品牌；活动品牌发生变化时重新载入编辑器
  useEffect(() => {
    viewModel.initialize()
  }, [viewModel, library.activeBrandId])

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark">✦</span>
          <span>BrandMirror</span>
          <span className="brand-subtitle">品牌视觉实验室</span>
        </div>
        <div className="topbar-right">
          <button className="brand-switcher" type="button" onClick={() => libraryViewModel.openPanel()}>
            <span className="brand-switcher-dot" style={{ background: activeBrand ? `linear-gradient(135deg, ${activeBrand.primary} 50%, ${activeBrand.secondary} 50%)` : undefined }} />
            <span className="brand-switcher-name">{activeBrand ? activeBrand.name : '打开品牌库'}</span>
            <span className="brand-switcher-meta">{library.brands.length} 个品牌</span>
            <span className="brand-switcher-arrow">⇄</span>
          </button>
          <span className="save-state"><span className="live-dot" />{snapshot.status === 'error' || library.status === 'error' ? '本地保存需检查' : '所有更改已保存'}</span>
          <span className="avatar-small">M</span>
        </div>
      </header>

      {library.message && (
        <div className={`library-notice ${library.status === 'error' ? 'error' : ''}`}>
          <span className="toast-icon">✦</span>
          <span>{library.message}</span>
          <button type="button" aria-label="关闭通知" onClick={() => libraryViewModel.dismissMessage()}>×</button>
        </div>
      )}

      {activeBrand ? (
        <main className="workspace">
          <div>
            <TokenControls snapshot={snapshot} onThemeChange={(theme) => viewModel.selectTheme(theme)} onColorChange={(field, value) => viewModel.updateColor(field, value)} onScaleChange={(field, index, value) => viewModel.updateScale(field, index, value)} onReset={() => viewModel.reset()} />
            <TokenExplorer tokens={snapshot.tokens} />
          </div>
          <div className="preview-area">
            <div className="hero-heading">
              <div>
                <span className="eyebrow">BRAND SYSTEM / {activeBrand.name}</span>
                <h1>一套令牌，<em>无限可能。</em></h1>
                <p>调整左侧令牌，观察它们如何在不同组件和页面中保持一致。</p>
              </div>
              <div className="feedback-toast">
                <span className="toast-icon">✦</span>
                <span><strong>{snapshot.message || '准备开始探索'}</strong><small>实时视觉反馈</small></span>
              </div>
            </div>
            <ComponentGallery tokens={snapshot.tokens} />
            <PageGallery tokens={snapshot.tokens} />
            <VersionCompare snapshot={snapshot} onSave={() => viewModel.saveVersion()} onToggle={() => viewModel.toggleCompare()} onExport={() => viewModel.exportBrandGuidelines()} />
          </div>
        </main>
      ) : (
        <main className="workspace-empty">
          <div className="workspace-empty-card">
            <div className="empty-icon">✦</div>
            <h2>品牌库中还没有品牌</h2>
            <p>新建一个品牌开始创作，或者打开回收站恢复之前删除的品牌。</p>
            <div className="workspace-empty-actions">
              <button className="primary-button" type="button" onClick={() => libraryViewModel.createBrand()}>＋ 新建品牌</button>
              {library.trash.length > 0 && <button className="secondary-button" type="button" onClick={() => libraryViewModel.openPanel()}>打开回收站（{library.trash.length}）</button>}
            </div>
          </div>
        </main>
      )}

      <footer className="bottom-status">
        <span><span className="live-dot" />已连接到本地工作区</span>
        <span>BrandMirror v0.2 <span className="footer-sep">·</span> 本地优先 <span className="footer-sep">·</span> 品牌库</span>
      </footer>

      <BrandLibraryPanel snapshot={library} viewModel={libraryViewModel} />
    </div>
  )
}
