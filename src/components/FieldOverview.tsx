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
  const [activeCell, setActiveCell] = useState<{ rowId: string | null; column: number }>({
    rowId: null, column: 0,
  })
  const activeRowId = activeCell.rowId !== null && rowModel.rowsById[activeCell.rowId]
    ? activeCell.rowId : null

  function navigateCells(event: KeyboardEvent<HTMLTableElement>) {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    const cell = target.closest('th, td')
    if (
      !(cell instanceof HTMLTableCellElement) || cell.closest('table') !== event.currentTarget ||
      (target !== cell && !(target instanceof HTMLButtonElement)) ||
      event.altKey || event.metaKey ||
      (event.ctrlKey && event.key !== 'Home' && event.key !== 'End')
    ) return
    const row = cell.parentElement
    if (!(row instanceof HTMLTableRowElement)) return
    const rows = event.currentTarget.rows
    let rowIndex = row.rowIndex
    let column = cell.cellIndex

    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowDown': {
        const step = event.key === 'ArrowUp' ? -1 : 1
        for (let index = rowIndex + step; index >= 0 && index < rows.length; index += step) {
          if (index === 0 || rows[index].hasAttribute('data-field-id')) {
            rowIndex = index
            break
          }
        }
        break
      }
      case 'ArrowLeft':
        column = Math.max(0, column - 1)
        break
      case 'ArrowRight':
        column = Math.min(row.cells.length - 1, column + 1)
        break
      case 'Home':
        if (event.ctrlKey) rowIndex = 0
        column = 0
        break
      case 'End':
        if (event.ctrlKey) {
          rowIndex = rows.length - 1
          while (rowIndex > 0 && !rows[rowIndex].hasAttribute('data-field-id')) rowIndex--
        }
        column = rows[rowIndex].cells.length - 1
        break
      default:
        return
    }
    event.preventDefault()
    const destination = rows[rowIndex].cells[column]
    const button = column === 0 ? destination.querySelector('button') : null
    const focusTarget = button ?? destination
    focusTarget.focus()
  }

  return (
    <>
    <p id="table-keyboard-help" className="text-sm text-muted-foreground">
      Keyboard: Tab into the table cells, then use arrow keys to move.
      Home/End move to the row edges; Ctrl+Home/End move to the table edges.
      Tab or Shift+Tab leaves the cells.
      Enter or Space on a field name selects it.
    </p>
    <Table
      className="min-w-[52rem]"
      onKeyDown={navigateCells}
      onFocus={(event) => {
        const target = event.target
        const cell = target instanceof HTMLElement ? target.closest('th, td') : null
        if (cell instanceof HTMLTableCellElement && cell.closest('table') === event.currentTarget) {
          setActiveCell({ rowId: cell.parentElement?.dataset.fieldId ?? null, column: cell.cellIndex })
        }
      }}
      containerProps={{
        role: 'region',
        'aria-label': 'Field overview table',
        'aria-describedby': 'overview-explanation table-keyboard-help',
        tabIndex: 0,
        className: 'rounded-xl border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
      }}
    >
      <TableCaption className="px-4 pb-4 text-left">
        Seven-day field observations, frost-risk fields first.
      </TableCaption>
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id}>
            {group.headers.map((header, column) => (
              <TableHead
                key={header.id}
                scope="col"
                tabIndex={activeRowId === null && activeCell.column === column ? 0 : -1}
                className="px-4 py-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
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
            {row.getAllCells().map((cell, column) => (
              <TableCell
                key={cell.id}
                tabIndex={column !== 0 && activeRowId === row.id && activeCell.column === column ? 0 : -1}
                className="max-w-64 px-4 py-4 align-top break-words whitespace-normal focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
              >
                {cell.column.id === 'field' ? (
                  <Button
                    type="button"
                    variant="link"
                    tabIndex={activeRowId === row.id && activeCell.column === column ? 0 : -1}
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
