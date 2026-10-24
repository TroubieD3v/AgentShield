"""Tool classification shared by the runtime."""

# Tools whose results are external/untrusted content flowing into the model context.
RETRIEVAL_TOOLS = {
    "read_document",
    "search_documents",
    "read_file",
    "read_inbox",
    "fetch_url",
    "web_search",
    "memory_read",
    "mcp_call",
    "delegate_task",
}
