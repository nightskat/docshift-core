## 2024-05-17 - Avoid intermediate arrays in hot path
**Learning:** In the `extractSegments` hot path where DOCX XML is parsed and checked, intermediate arrays (e.g. `Array.filter().every()`) add measurable overhead and GC pressure.
**Action:** Replace `filter` and other array operations with single-pass loops and early exits where possible to improve performance.
