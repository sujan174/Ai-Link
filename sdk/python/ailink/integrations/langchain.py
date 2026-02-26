"""
LangChain integration for AILink Gateway.

Provides factory functions that return LangChain-native LLM objects
pre-configured to route through the AILink gateway.

Usage:
    from ailink import AIlinkClient
    from ailink.integrations import langchain_chat

    client = AIlinkClient(api_key="ailink_v1_...")

    # Drop-in replacement for ChatOpenAI
    llm = langchain_chat(client, model="gpt-4o")

    # Use with any LangChain chain, agent, or tool
    from langchain_core.messages import HumanMessage
    response = llm.invoke([HumanMessage(content="Hello")])

    # Works with LangChain agents
    from langchain.agents import create_openai_tools_agent
    agent = create_openai_tools_agent(llm, tools, prompt)
"""

from __future__ import annotations
from typing import Optional, Any, TYPE_CHECKING

if TYPE_CHECKING:
    from ailink.client import AIlinkClient


def langchain_chat(
    client: "AIlinkClient",
    model: str = "gpt-4o",
    *,
    temperature: Optional[float] = None,
    max_tokens: Optional[int] = None,
    streaming: bool = False,
    default_headers: Optional[dict[str, str]] = None,
    **kwargs: Any,
):
    """
    Create a LangChain ChatOpenAI instance routed through AILink.

    This is a drop-in replacement for ChatOpenAI that routes all requests
    through the AILink gateway, giving you:
    - Policy enforcement (rate limits, spend caps, content filtering)
    - Audit logging (every request logged with cost tracking)
    - Credential injection (no API keys in your code)
    - Guardrails (PII redaction, jailbreak protection)

    Args:
        client:     An initialized AIlinkClient instance.
        model:      Model name (e.g. "gpt-4o", "gpt-4o-mini").
                    Can also use AILink model aliases.
        temperature: Sampling temperature (0-2).
        max_tokens:  Maximum tokens in the response.
        streaming:   Enable streaming responses.
        default_headers: Extra headers to send with every request.
        **kwargs:    Passed through to ChatOpenAI constructor.

    Returns:
        A ``langchain_openai.ChatOpenAI`` instance.

    Raises:
        ImportError: If langchain-openai is not installed.

    Example::

        from ailink import AIlinkClient
        from ailink.integrations import langchain_chat

        client = AIlinkClient(api_key="ailink_v1_...")
        llm = langchain_chat(client, model="gpt-4o", temperature=0)

        # Use in a chain
        from langchain_core.prompts import ChatPromptTemplate
        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are a helpful assistant."),
            ("user", "{input}"),
        ])
        chain = prompt | llm
        response = chain.invoke({"input": "What is AILink?"})
    """
    try:
        from langchain_openai import ChatOpenAI
    except ImportError:
        raise ImportError(
            "LangChain integration requires the 'langchain-openai' package.\n"
            "Install it with: pip install ailink[langchain]\n"
            "Or standalone:   pip install langchain-openai"
        ) from None

    headers = {"Authorization": f"Bearer {client.api_key}"}
    if client._agent_name:
        headers["X-AIlink-Agent-Name"] = client._agent_name
    if default_headers:
        headers.update(default_headers)

    init_kwargs: dict[str, Any] = {
        "model": model,
        "base_url": client.gateway_url,
        "api_key": client.api_key,
        "default_headers": headers,
        "streaming": streaming,
        **kwargs,
    }
    if temperature is not None:
        init_kwargs["temperature"] = temperature
    if max_tokens is not None:
        init_kwargs["max_tokens"] = max_tokens

    return ChatOpenAI(**init_kwargs)


def langchain_embeddings(
    client: "AIlinkClient",
    model: str = "text-embedding-3-small",
    **kwargs: Any,
):
    """
    Create a LangChain OpenAIEmbeddings instance routed through AILink.

    Args:
        client:  An initialized AIlinkClient instance.
        model:   Embedding model name.
        **kwargs: Passed through to OpenAIEmbeddings constructor.

    Returns:
        A ``langchain_openai.OpenAIEmbeddings`` instance.

    Raises:
        ImportError: If langchain-openai is not installed.

    Example::

        from ailink.integrations import langchain_embeddings
        embeddings = langchain_embeddings(client, model="text-embedding-3-small")

        # Use with a vector store
        vectors = embeddings.embed_documents(["Hello world", "Goodbye world"])
    """
    try:
        from langchain_openai import OpenAIEmbeddings
    except ImportError:
        raise ImportError(
            "LangChain integration requires the 'langchain-openai' package.\n"
            "Install it with: pip install ailink[langchain]\n"
            "Or standalone:   pip install langchain-openai"
        ) from None

    headers = {"Authorization": f"Bearer {client.api_key}"}
    if client._agent_name:
        headers["X-AIlink-Agent-Name"] = client._agent_name

    return OpenAIEmbeddings(
        model=model,
        base_url=client.gateway_url,
        api_key=client.api_key,
        default_headers=headers,
        **kwargs,
    )
