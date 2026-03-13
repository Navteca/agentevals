"""Drop-in streaming for existing agent code using the AgentEvals SDK.

This is the primary SDK pattern — wrap your existing code in a context manager
and traces stream to the agentevals UI automatically.

Prerequisites:
    1. Start agentevals dev server:
       $ agentevals serve --dev --port 8001

    2. (Optional) Start UI:
       $ cd ui && npm run dev

    3. Set your API key:
       $ export OPENAI_API_KEY="your-key-here"

Usage:
    $ python examples/sdk_example/context_manager_example.py
"""

import logging

from agentevals import AgentEvals
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

logging.basicConfig(level=logging.INFO)
load_dotenv(override=True)

app = AgentEvals()
llm = ChatOpenAI(model="gpt-4o-mini")

with app.session(eval_set_id="sdk-context-manager-demo", metadata={"model": "gpt-4o-mini"}):
    print(llm.invoke("What is 2 + 2?").content)
    print(llm.invoke("Is that number prime?").content)
