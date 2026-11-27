import type { Source, SourcesApi } from './types'
import { localFixture } from '@/lib/mockServer/localFixture'
const sources: Source[] = structuredClone(localFixture.sources ?? [])
export const mockSources: SourcesApi = { async list() { return { items: structuredClone(sources) } } }
