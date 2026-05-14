## 2024-05-18 - Avoid repeated instantiation of XMLSerializer
**Learning:** Re-instantiating `XMLSerializer` inside a loop can be a performance bottleneck when serializing many small XML nodes, such as run properties (`rPr`) in a DOCX file.
**Action:** Share a single `XMLSerializer` instance for serialization tasks across the application to improve performance.
