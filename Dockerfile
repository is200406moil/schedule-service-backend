FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY alembic ./alembic
COPY alembic.ini ./alembic.ini
COPY app ./app
COPY prestart.sh ./

RUN chmod +x ./prestart.sh

EXPOSE 8000

CMD ["bash", "-c", "./prestart.sh && uvicorn app.main:app --host 0.0.0.0 --port 8000"]