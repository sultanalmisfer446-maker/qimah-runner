FROM node:20-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 gcc g++ default-jdk-headless golang php-cli ruby sqlite3 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server.js package.json ./
RUN useradd -m runner && chown -R runner /app
USER runner
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
