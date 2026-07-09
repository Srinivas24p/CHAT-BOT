import os
import sys
import google.generativeai as genai
from typing import Optional
from typing_extensions import TypedDict
import networkx as nx
import matplotlib.pyplot as plt
from langgraph.graph import StateGraph
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv

# Load configurations from .env
load_dotenv()

# ==========================================
# 1. GEMINI API SETUP
# ==========================================
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise ValueError("Error: GEMINI_API_KEY is not set. Please define it in your .env file.")
genai.configure(api_key=api_key)

# Use configurable model from environment (defaults to gemini-1.5-flash for higher free tier limits)
model_name = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
model = genai.GenerativeModel(model_name)

def ask_gemini(prompt: str) -> str:
    try:
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        return f"Sorry, something went wrong with the Gemini API: {e}"

# ==========================================
# 2. LANGGRAPH STATE DEFINITION
# ==========================================
class GraphState(TypedDict):
    question: Optional[str]
    classification: Optional[str]
    response: Optional[str]

# ==========================================
# 3. GRAPH NODES (LOGIC)
# ==========================================
def classify(state: GraphState) -> GraphState:
    question = state.get("question", "").lower()
    greetings = ["hello", "hi", "hey", "good morning", "good evening", "greetings"]

    if any(word in question for word in greetings):
        classification = "greeting"
    else:
        classification = "search"

    return {**state, "classification": classification}

def respond(state: GraphState) -> GraphState:
    classification = state.get("classification")
    question = state.get("question")

    if classification == "greeting":
        response = "Hello! How can I help you today?"
    elif classification == "search":
        response = ask_gemini(question)
    else:
        response = "I'm not sure how to respond to that."

    return {**state, "response": response}

# ==========================================
# 4. BUILDING THE GRAPH
# ==========================================
builder = StateGraph(GraphState)
builder.add_node("classify", classify)
builder.add_node("respond", respond)

builder.set_entry_point("classify")
builder.add_edge("classify", "respond")
builder.set_finish_point("respond")

chatbot_graph = builder.compile()

# ==========================================
# 5. FLASK WEB APP SETUP
# ==========================================
app = Flask(__name__)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.json or {}
    user_input = data.get("question", "").strip()
    if not user_input:
        return jsonify({"error": "Please provide a valid question."}), 400

    try:
        initial_state = {"question": user_input}
        result = chatbot_graph.invoke(initial_state)
        return jsonify({
            "response": result.get("response", ""),
            "classification": result.get("classification", "")
        })
    except Exception as e:
        return jsonify({"error": f"An error occurred in the Graph workflow: {str(e)}"}), 500

# ==========================================
# 6. VISUALIZE WORKFLOW (Optional)
# ==========================================
def visualize_workflow(graph_builder):
    G = nx.DiGraph()
    for node in graph_builder.nodes:
        G.add_node(node)
    for edge in graph_builder.edges:
        G.add_edge(edge[0], edge[1])

    pos = nx.spring_layout(G)
    nx.draw(G, pos, with_labels=True, node_size=3000, node_color="skyblue",
            font_size=12, font_weight="bold", arrows=True)
    plt.title("LangGraph Chatbot Workflow Visualization")
    plt.show()

# ==========================================
# 7. RUNNING MODE DETERMINATION
# ==========================================
if __name__ == "__main__":
    # Check if CLI mode was requested
    if len(sys.argv) > 1 and sys.argv[1] == "--cli":
        print("\n=== Gemini-Powered Chatbot (CLI Mode) ===")
        print("Type your question below. Type 'exit' to quit.\n")

        while True:
            user_input = input("You: ")
            if user_input.strip().lower() in ['exit', 'quit', 'stop']:
                print("Bot: Goodbye!")
                break

            initial_state = {"question": user_input}
            result = chatbot_graph.invoke(initial_state)

            print("Bot:", result["response"])
            print("-" * 50)
    else:
        # Run Flask Web Server
        port = int(os.getenv("PORT", 5000))
        print(f"Starting Flask server on http://127.0.0.1:{port}...")
        app.run(debug=True, host="127.0.0.1", port=port)