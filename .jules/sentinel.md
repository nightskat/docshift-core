## 2026-05-14 - Strict XML Parsing for xmldom
**Vulnerability:** The `@xmldom/xmldom` library parses malformed or malicious XML inputs (such as unclosed attributes or mismatched tags) without throwing an error by default, leading to silent failure or processing of corrupted DOM state.
**Learning:** By default, `@xmldom/xmldom` has an empty or logging-only `errorHandler`. When processing external DOCX files, a malformed `document.xml` could bypass expected structural checks and lead to undefined behavior or state corruption because parsing errors don't stop execution.
**Prevention:** Always configure `DOMParser` from `@xmldom/xmldom` with an explicit `errorHandler` that throws exceptions on `error` and `fatalError` severity levels to ensure the pipeline fails securely when encountering invalid XML.

## 2026-05-14 - Sensitive Data Leak in Error Logs
**Vulnerability:** The pipeline caught reconstruction errors in `applyTranslations` and logged the raw error object to `console.error`. Because the error message includes document text fingerprints (up to 32 characters of original text) for debugging, this leaked potentially sensitive user data (PII) into server logs.
**Learning:** Error messages that include data snippets for debugging are dangerous when logged in a production environment, as they bypass normal data privacy controls.
**Prevention:** Always log generic error messages without raw error objects or stack traces when the error context includes user data. Fail securely without exposing internals.
