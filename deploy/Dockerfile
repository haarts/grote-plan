# Runtime image for a locally built binary (see deploy/deploy.sh).
FROM ubuntu:26.04
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY grote-plan /usr/local/bin/grote-plan
ENV GP_DATA=/data GP_ADDR=0.0.0.0:8080 GP_SECURE_COOKIE=1
EXPOSE 8080
CMD ["grote-plan", "serve"]
