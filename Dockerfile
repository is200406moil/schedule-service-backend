FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.lock ./

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.lock

COPY alembic ./alembic
COPY alembic.ini ./alembic.ini
COPY app ./app
COPY prestart.sh ./

RUN sed -i 's/\r$//' ./prestart.sh \
    && chmod +x ./prestart.sh

EXPOSE 8000

CMD ["bash", "-c", "./prestart.sh && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
