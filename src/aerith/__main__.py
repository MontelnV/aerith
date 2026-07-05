from __future__ import annotations

import uvicorn

from aerith.config import get_settings


def main() -> None:
    """Entry point for `python -m aerith` and the console script."""
    server = get_settings().server
    uvicorn.run("aerith.main:app", host=server.host, port=int(server.port), reload=False)


if __name__ == "__main__":
    main()
