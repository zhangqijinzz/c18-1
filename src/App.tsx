import { BrandMirrorPage } from './features/brand-mirror/views/BrandMirrorPage'
import { LocalStorageService } from './features/brand-mirror/services/storageService'
import { ActiveBrandRepository } from './features/brand-mirror/repositories/brandRepository'
import { BrowserBrandGuidelinesExporter } from './features/brand-mirror/services/exportService'
import { BrandMirrorViewModel } from './features/brand-mirror/viewmodels/brandMirrorViewModel'
import { LocalBrandLibraryRepository } from './features/brand-library/repositories/brandLibraryRepository'
import { BrandLibraryViewModel } from './features/brand-library/viewmodels/brandLibraryViewModel'

const storage = new LocalStorageService()
const viewModel = new BrandMirrorViewModel(new ActiveBrandRepository(storage), new BrowserBrandGuidelinesExporter())
const libraryViewModel = new BrandLibraryViewModel(new LocalBrandLibraryRepository(storage), (message) => viewModel.initialize(message))

export default function App() {
  return <BrandMirrorPage viewModel={viewModel} libraryViewModel={libraryViewModel} />
}
