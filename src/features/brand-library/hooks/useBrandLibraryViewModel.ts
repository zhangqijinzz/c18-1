import { useEffect, useState } from 'react'
import type { BrandLibrarySnapshot } from '../viewmodels/brandLibraryViewModel'
import type { BrandLibraryViewModel } from '../viewmodels/brandLibraryViewModel'

export function useBrandLibraryViewModel(viewModel: BrandLibraryViewModel): BrandLibrarySnapshot {
  const [snapshot, setSnapshot] = useState(viewModel.getSnapshot())
  useEffect(() => {
    const unsubscribe = viewModel.subscribe(() => setSnapshot(viewModel.getSnapshot()))
    viewModel.initialize()
    return unsubscribe
  }, [viewModel])
  return snapshot
}
