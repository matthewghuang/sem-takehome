import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { RecentTrend } from '@/components/RecentTrend'
import type { FieldSummary } from '@/domain/fieldSummary'

const features = tableFeatures({})
const helper = createColumnHelper<typeof features, FieldSummary>()
const columns = helper.columns([
  helper.accessor((summary) => summary.field.name, { id: 'field', header: 'Field' }),
  helper.accessor((summary) => summary.field.crop, { id: 'crop', header: 'Crop' }),
  helper.accessor('coldestLowC', {
    header: 'Coldest daily low (°C)',
    cell: ({ getValue }) => {
      const low = getValue()
      return low === null ? 'No readings' : `${low}°C`
    },
  }),
  helper.accessor('risk', {
    header: 'Frost status',
    cell: ({ getValue }) => {
      const risk = getValue()
      return (
        <Badge variant={risk === 'at-risk' ? 'default' : risk === 'unknown' ? 'outline' : 'secondary'}>
          {risk === 'at-risk' ? 'Frost risk' : risk === 'unknown' ? 'No data' : 'No frost observed'}
        </Badge>
      )
    },
  }),
  helper.accessor('trend', {
    header: 'Recent trend',
    cell: ({ getValue }) => <RecentTrend trend={getValue()} />,
  }),
])
const emptyFields: FieldSummary[] = []
const skeletonRows = [0, 1, 2]

export function FieldOverview({ fields, isLoading, selectedFieldId, onSelect }: {
  fields: FieldSummary[] | null
  isLoading: boolean
  selectedFieldId: string | null
  onSelect: (id: string) => void
}) {
  const table = useTable({
    features,
    columns,
    data: fields ?? emptyFields,
    getRowId: (summary) => summary.field.id,
  })
  const rowModel = table.getRowModel()
  const [activeRowId, setActiveRowId] = useState<string | null>(null)
  const entryRowId = activeRowId !== null && rowModel.rowsById[activeRowId]
    ? activeRowId : rowModel.rows[0]?.id ?? null

  function navigateRows(event: KeyboardEvent<HTMLDivElement>) {
    if (
      event.altKey || event.metaKey ||
      (event.ctrlKey && event.key !== 'Home' && event.key !== 'End')
    ) return
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      return
    }
    if (
      event.key !== 'ArrowUp' && event.key !== 'ArrowDown' &&
      event.key !== 'Home' && event.key !== 'End'
    ) return
    event.preventDefault()
    if (rowModel.rows.length === 0) return

    const rows = event.currentTarget.querySelector('tbody')?.rows
    if (!rows) return
    const target = event.target
    const row = target instanceof HTMLElement ? target.closest('tr[data-field-id]') : null
    const currentIndex = row instanceof HTMLTableRowElement ? row.sectionRowIndex : -1
    let nextIndex: number
    switch (event.key) {
      case 'ArrowUp':
        nextIndex = Math.max(0, currentIndex - 1)
        break
      case 'ArrowDown':
        nextIndex = Math.min(rows.length - 1, currentIndex + 1)
        break
      case 'Home':
        nextIndex = 0
        break
      default:
        nextIndex = rows.length - 1
    }
    rows[nextIndex].querySelector('button')?.focus()
  }

  return (
    <>
    <p id="table-keyboard-help" className="text-sm text-muted-foreground">
      Keyboard: Up/Down move between field rows. Left/Right do nothing.
      Home/End move to the first/last row. Enter or Space selects the focused field.
      Tab or Shift+Tab leaves the rows.
    </p>
    <Table
      className="min-w-[52rem]"
      containerProps={{
        role: 'region',
        'aria-label': 'Field overview table',
        'aria-describedby': 'overview-explanation table-keyboard-help',
        tabIndex: 0,
        onKeyDown: navigateRows,
        className: 'rounded-xl border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
      }}
    >
      <TableCaption className="px-4 pb-4 text-left">
        Seven-day field observations, frost-risk fields first.
      </TableCaption>
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id}>
            {group.headers.map((header) => (
              <TableHead
                key={header.id}
                scope="col"
                className="px-4 py-3"
              >
                {header.isPlaceholder ? null : <table.FlexRender header={header} />}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {fields === null ? isLoading ? skeletonRows.map((row) => (
          <TableRow key={row} aria-hidden="true">
            {columns.map((_, column) => (
              <TableCell key={column} className="px-4 py-4">
                <Skeleton className="h-5 w-24" />
              </TableCell>
            ))}
          </TableRow>
        )) : (
          <TableRow>
            <TableCell colSpan={columns.length} className="px-4 py-8">No field data loaded.</TableCell>
          </TableRow>
        ) : fields.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columns.length} className="px-4 py-8">No fields available.</TableCell>
          </TableRow>
        ) : rowModel.rows.map((row) => (
          <TableRow
            key={row.id}
            data-field-id={row.id}
            data-state={selectedFieldId === row.id ? 'selected' : undefined}
            className="cursor-pointer data-[state=selected]:bg-muted/50"
            onClick={(event) => {
              event.currentTarget.querySelector('button')?.focus()
              onSelect(row.id)
            }}
          >
            {row.getAllCells().map((cell) => (
              <TableCell
                key={cell.id}
                className="max-w-64 px-4 py-4 align-top break-words whitespace-normal"
              >
                {cell.column.id === 'field' ? (
                  <Button
                    type="button"
                    variant="link"
                    tabIndex={entryRowId === row.id ? 0 : -1}
                    onFocus={() => setActiveRowId(row.id)}
                    aria-pressed={selectedFieldId === row.id}
                    aria-controls="field-detail"
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelect(row.id)
                    }}
                    className="h-auto min-h-8 max-w-full justify-start px-0 text-left whitespace-normal aria-pressed:font-semibold aria-pressed:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    {row.original.field.name}
                  </Button>
                ) : <table.FlexRender cell={cell} />}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </>
  )
}
