"""Shared gateway entry point; start the local web server separately."""
import asyncio
from bridge import main
if __name__ == "__main__": asyncio.run(main())
