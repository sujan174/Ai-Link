"""
AILink Framework Integrations.

Provides zero-config factory functions for popular AI frameworks:
- LangChain: langchain_chat(), langchain_embeddings()
- CrewAI:    crewai_llm()
- LlamaIndex: llamaindex_llm()

Each function returns a framework-native LLM object pre-configured
to route all requests through the AILink gateway with full policy
enforcement, audit logging, spend tracking, and guardrails.
"""

from .langchain import langchain_chat, langchain_embeddings
from .crewai import crewai_llm
from .llamaindex import llamaindex_llm

__all__ = [
    "langchain_chat",
    "langchain_embeddings",
    "crewai_llm",
    "llamaindex_llm",
]
