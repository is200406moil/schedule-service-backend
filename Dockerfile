FROM node:22-alpine AS frontend-build

WORKDIR /work/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend ./
RUN npm run build

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /workspace/backend

COPY backend/requirements.txt ./

RUN pip install --no-cache-dir -r requirements.txt \
    && pip check

RUN addgroup --system app \
    && adduser --system --ingroup app app

COPY backend/alembic ./alembic
COPY backend/alembic.ini ./alembic.ini
COPY backend/app ./app
COPY --from=frontend-build /work/frontend/dist /workspace/frontend/dist
COPY backend/prestart.sh ./

RUN sed -i 's/\r$//' ./prestart.sh \
    && chmod +x ./prestart.sh

EXPOSE 8000

USER app

CMD ["bash", "-c", "./prestart.sh && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
