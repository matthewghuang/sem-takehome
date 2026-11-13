import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fieldSnapshotQueryOptions } from '@/data/fieldData'
import { summarizeFields } from '@/domain/fieldSummary'
import type { FieldSummary } from '@/domain/fieldSummary'

export type FieldData = {
  fields: FieldSummary[] | null
  fetchedAt: string | null
  isRefreshing: boolean
  error: string | null
  refresh: () => void
}

export function useFieldData(): FieldData {
  const client = useQueryClient()
  const query = useQuery(fieldSnapshotQueryOptions)
  const fields = useMemo(() => (
    query.data === undefined ? null : summarizeFields(
      query.data.fields, query.data.stations, query.data.readings, query.data.asOfDate,
    )
  ), [query.data])
  const { refetch } = query
  const refresh = useCallback(() => {
    // Read live cache status so repeated calls before React rerenders are also no-ops.
    if (client.isFetching({ queryKey: fieldSnapshotQueryOptions.queryKey, exact: true }) === 0) {
      void refetch({ cancelRefetch: false })
    }
  }, [client, refetch])

  return {
    fields,
    fetchedAt: query.data?.fetchedAt ?? null,
    isRefreshing: query.isFetching,
    error: query.isError && !query.isFetching
      ? query.data === undefined
        ? 'Field data is currently unavailable. Please retry.'
        : 'Could not refresh. Showing last successfully loaded data.'
      : null,
    refresh,
  }
}
