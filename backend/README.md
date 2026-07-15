### Backend

- `api/` -- API Gateway + Lambda endpoints (all 5 from the API Contract). Run locally with `python api/local_server.py`, see `api/README.md`.
- `chatbot/` -- Bedrock integration + chatbot Lambda logic (owned separately).
- `rules_engine/` -- pure-Python `compute_flags()` module (owned separately). Until this lands, `api/handlers/store.py` uses a temporary stub with the same interface.
