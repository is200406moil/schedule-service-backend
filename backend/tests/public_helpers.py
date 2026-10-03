import json
import re

from httpx import Response


def public_boot(response: Response) -> dict:
    match = re.search(
        r'<script id="public-data" type="application/json">(.*?)</script>', response.text, re.DOTALL
    )
    assert match is not None
    return json.loads(match.group(1))
