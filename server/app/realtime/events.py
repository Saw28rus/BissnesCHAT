def envelope(event_type: str, payload: dict) -> dict:
    return {"v": 1, "type": event_type, **payload}
