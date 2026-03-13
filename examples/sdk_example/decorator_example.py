"""Decorator shorthand for simple prompt-to-response agents.

Use this pattern when your agent is a simple function that takes a prompt
and returns a result. For more complex agents with multi-turn conversations
or state, use the context manager pattern instead.

Prerequisites:
    1. Start agentevals dev server:
       $ agentevals serve --dev --port 8001

    2. Set your API key:
       $ export OPENAI_API_KEY="your-key-here"

Usage:
    $ python examples/sdk_example/decorator_example.py
"""

import logging

from agentevals import AgentEvals
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

logging.basicConfig(level=logging.INFO)
load_dotenv(override=True)

app = AgentEvals(eval_set_id="sdk-decorator-demo")
llm = ChatOpenAI(model="gpt-4o-mini")


@app.agent
def my_agent(prompt):
    return llm.invoke(prompt).content


app.run(["What is 2 + 2?", "Tell me a joke", "Is 17 prime?"])
