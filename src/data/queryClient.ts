import { hashKey, QueryClient } from '@tanstack/react-query'
import { fieldSnapshotQueryOptions, readSavedSnapshot, saveSnapshot } from './fieldData'
import type { Snapshot } from './fieldData'

const snapshotQueryHash = hashKey(fieldSnapshotQueryOptions.queryKey)

export function createFieldQueryClient(): QueryClient {
  const client = new QueryClient()
  client.setQueryDefaults(fieldSnapshotQueryOptions.queryKey, {
    gcTime: fieldSnapshotQueryOptions.gcTime,
  })
  const saved = readSavedSnapshot()
  if (saved !== null) {
    client.setQueryData(fieldSnapshotQueryOptions.queryKey, saved, {
      updatedAt: Date.parse(saved.fetchedAt),
    })
  }

  // One subscription per client; hydration/manual writes and unrelated queries never persist.
  client.getQueryCache().subscribe((event) => {
    if (
      event.type === 'updated' &&
      event.action.type === 'success' &&
      !event.action.manual &&
      event.query.queryHash === snapshotQueryHash
    ) {
      // This key's query function only returns complete raw snapshots.
      saveSnapshot(event.action.data as Snapshot)
    }
  })
  return client
}

// Construct and hydrate before React renders any subscribers, including StrictMode remounts.
export const queryClient = createFieldQueryClient()
