# Open Issues

## Data source indicator only visible in map view

The `source` field (e.g. "SCB", "ESV") from each `DatasetDescriptor` is currently only shown
as `· SCB · 2024` text inside `MapLegend` (`src/components/map/MapLegend.tsx`), which only
renders when `activeView === 'map'`. Not visible in chart, table, or profile views.

Should be restored as a persistent element (chip or label) in the sidebar or dataset selector
so the source is always visible regardless of active view.
