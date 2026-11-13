# --- build
FROM rust:1-bookworm AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY static ./static
RUN cargo build --release

# --- run
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/target/release/grote-plan /usr/local/bin/grote-plan
ENV GP_DATA=/data GP_ADDR=0.0.0.0:8080
VOLUME /data
EXPOSE 8080
CMD ["grote-plan", "serve"]
