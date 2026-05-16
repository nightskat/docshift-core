## 2024-05-18 - Avoid repeated instantiation of XMLSerializer
**Learning:** Re-instantiating `XMLSerializer` inside a loop can be a performance bottleneck when serializing many small XML nodes, such as run properties (`rPr`) in a DOCX file.
**Action:** Share a single `XMLSerializer` instance for serialization tasks across the application to improve performance.

## 2024-05-19 - Eager XML Serialization Overhead
**Learning:** Eagerly invoking `sharedSerializer.serializeToString()` on run properties (`rPr`) during DOCX extraction for every run caused significant performance overhead (~15-25%), even though those serialized properties were often unused (e.g. for uniform paragraphs or empty runs).
**Action:** Use native JavaScript getters on data objects (e.g. `get rPrXml()`) to lazily evaluate expensive operations. This prevents unnecessary CPU usage for formatting properties that are never requested downstream.

## 2024-05-20 - Avoid intermediate array allocations in hot paths
**Learning:** Using functional array methods like `.filter()` followed by `.every()` in hot paths (like `isUniform` which runs thousands of times per DOCX file) creates unnecessary intermediate array allocations and causes multiple traversals, increasing GC pressure and execution time.
**Action:** Replace chained functional array methods with single-pass `for` loops with early exits in performance-critical hot paths.
