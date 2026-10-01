interface EmptyWorkspaceProps {
  onCreate: () => void
  onOpenManager: () => void
  hasTrashed: boolean
}

export function EmptyWorkspace({ onCreate, onOpenManager, hasTrashed }: EmptyWorkspaceProps) {
  return (
    <div className="empty-workspace">
      <div className="empty-workspace-card">
        <div className="empty-workspace-icon">✦</div>
        <span className="eyebrow">BRAND LIBRARY</span>
        <h2>品牌库还是空的</h2>
        <p>新建一个品牌，团队就可以并行推进多套视觉令牌。每个品牌独立保存自己的令牌与版本历史，切换、复制、删除都互不覆盖。</p>
        <div className="empty-workspace-actions">
          <button type="button" className="primary-button" onClick={onCreate}>＋ 新建第一个品牌</button>
          {hasTrashed && <button type="button" className="secondary-button" onClick={onOpenManager}>从回收站恢复品牌</button>}
        </div>
      </div>
    </div>
  )
}
