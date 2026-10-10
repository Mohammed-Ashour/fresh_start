# Scientific and geospatial policy

- Make units, CRS, axis order, coordinate order, dtype, nodata, dimensions, shape, timestamps, time zones, calendars, valid ranges, and missing-data semantics explicit.
- Preserve required metadata and numerical meaning through transformations.
- Check casting, overflow, resampling, alignment, masking, invalid geometries, and boundary conditions.
- Use representative fixtures, numerical invariants, or trusted baseline comparisons when ordinary unit tests are insufficient.
- Keep coordinate transformations and grid assumptions visible.
- Do not introduce performance layers until correctness is protected and a bottleneck is measured.
- When optimizing, verify that parallelism, chunking, caching, or compilation preserves deterministic and numerical behavior.
