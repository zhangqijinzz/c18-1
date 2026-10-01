import type { PendingBrandAction } from '../models/brandMirrorModels'

interface ConfirmDialogProps {
  action: PendingBrandAction
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ action, onConfirm, onCancel }: ConfirmDialogProps) {
  const content = describe(action)
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
      <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <div className="confirm-icon">{content.icon}</div>
        <h3 id="confirm-dialog-title">{content.title}</h3>
        <p>{content.body}</p>
        {content.note && <div className="confirm-note">{content.note}</div>}
        <div className="confirm-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>{content.cancelLabel}</button>
          <button type="button" className={content.danger ? 'danger-button' : 'primary-button'} onClick={onConfirm} autoFocus>{content.confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

function describe(action: PendingBrandAction): { icon: string; title: string; body: string; note?: string; confirmLabel: string; cancelLabel: string; danger: boolean } {
  if (action.kind === 'switch') {
    return {
      icon: '⇄',
      title: `切换到「${action.brandName}」？`,
      body: `当前正在编辑品牌「${action.currentName}」。它的所有更改都已自动保存，切换后可以随时再切回来。`,
      note: '每个品牌的令牌与版本历史独立保存，切换不会覆盖任何数据。',
      confirmLabel: '保存当前并切换',
      cancelLabel: '继续编辑当前品牌',
      danger: false,
    }
  }
  if (action.kind === 'delete') {
    return {
      icon: '🗑',
      title: `删除品牌「${action.brandName}」？`,
      body: `该品牌将从品牌库中移除${action.versionCount > 0 ? `，其 ${action.versionCount} 个保存版本` : ''}，其它品牌的令牌与版本历史不受影响。`,
      note: '品牌会先进入回收站，可立即撤销或在之后恢复，不会直接丢失。',
      confirmLabel: '移入回收站',
      cancelLabel: '取消',
      danger: true,
    }
  }
  return {
    icon: '⚠',
    title: `彻底删除「${action.brandName}」？`,
    body: '这会永久删除该品牌的令牌与全部版本历史，操作无法恢复。',
    note: '仅这一个品牌受影响；其它品牌与回收站中的其它品牌保持不变。',
    confirmLabel: '永久删除',
    cancelLabel: '保留在回收站',
    danger: true,
  }
}
