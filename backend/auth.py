import jwt
from fastapi import HTTPException, Header
from .config import settings


def get_current_user_uuid(authorization: str = Header(...)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        return payload["uuid"]
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Unauthorized")
